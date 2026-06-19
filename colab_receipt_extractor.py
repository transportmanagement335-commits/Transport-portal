# --- COLAB SETUP SCRIPT ---
# 1. Open Google Colab (https://colab.research.google.com/)
# 2. Create a New Notebook.
# 3. Go to Runtime -> Change runtime type -> Hardware accelerator: T4 GPU
# 4. Paste ALL of this code into a single cell.
# 5. Replace HF_TOKEN and NGROK_TOKEN with your actual tokens.
# 6. Click the Run button!

!pip install -q fastapi uvicorn pyngrok nest-asyncio transformers torch torchvision accelerate qwen-vl-utils python-multipart

import nest_asyncio
from pyngrok import ngrok
from fastapi import FastAPI, UploadFile, File
import uvicorn
import torch
import re
import os
import shutil
from transformers import Qwen2_5_VLForConditionalGeneration, AutoProcessor
from qwen_vl_utils import process_vision_info
from huggingface_hub import login

# ==========================================
# 🛑 PUT YOUR TOKENS HERE 🛑
HF_TOKEN = "hf_YOUR_TOKEN_HERE"
NGROK_TOKEN = "YOUR_NGROK_TOKEN_HERE"
# ==========================================

login(token=HF_TOKEN)
ngrok.set_auth_token(NGROK_TOKEN)

print("Loading model on T4 GPU...")
model = Qwen2_5_VLForConditionalGeneration.from_pretrained(
    "ChotaDon27/qwen25vl-receipt-extractor",
    torch_dtype=torch.float16,
    device_map="auto"
)
processor = AutoProcessor.from_pretrained("ChotaDon27/qwen25vl-receipt-extractor")
print("Model loaded successfully!")

app = FastAPI()

@app.post("/extract")
async def extract_receipt(file: UploadFile = File(...)):
    # Save the uploaded image temporarily
    temp_path = f"/tmp/{file.filename}"
    with open(temp_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
        
    messages = [
        {
            "role": "user",
            "content": [
                {"type": "image", "image": f"file://{temp_path}"},
                {"type": "text", "text": "Extract the total amount from this receipt. Return only the number."}
            ]
        }
    ]
    
    text = processor.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)
    image_inputs, video_inputs = process_vision_info(messages)
    
    inputs = processor(
        text=[text],
        images=image_inputs,
        videos=video_inputs,
        padding=True,
        return_tensors="pt"
    ).to(model.device)
    
    with torch.no_grad():
        generated_ids = model.generate(**inputs, max_new_tokens=128)
        
    generated_ids_trimmed = [
        out_ids[len(in_ids):] for in_ids, out_ids in zip(inputs.input_ids, generated_ids)
    ]
    output_text = processor.batch_decode(
        generated_ids_trimmed, skip_special_tokens=True, clean_up_tokenization_spaces=False
    )[0]
    
    os.remove(temp_path)
    
    match = re.search(r'\d+\.\d+|\d+', output_text)
    amount = float(match.group()) if match else None
    
    return {"extracted_text": output_text, "amount": amount}

public_url = ngrok.connect(8000).public_url
print(f"\n=======================================================")
print(f"✅ NGROK TUNNEL IS LIVE!")
print(f"👉 COPY THIS URL INTO YOUR .env FILE:")
print(f"RECEIPT_API_URL={public_url}")
print(f"=======================================================\n")

nest_asyncio.apply()
uvicorn.run(app, host="0.0.0.0", port=8000)
