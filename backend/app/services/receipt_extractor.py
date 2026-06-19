import os
import logging
from typing import Optional
import httpx

logger = logging.getLogger(__name__)

class ReceiptExtractorService:
    _instance = None
    
    @classmethod
    def get_instance(cls):
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance
        
    async def extract_amount(self, image_path: str, prompt: str = "") -> Optional[float]:
        """
        Extracts the total amount from a receipt image by sending it to the Colab API.
        """
        api_url = os.environ.get("RECEIPT_API_URL")
        
        if not api_url:
            logger.warning("RECEIPT_API_URL is not set in .env! Skipping receipt verification.")
            return None
            
        abs_image_path = os.path.abspath(image_path)
        
        try:
            # We use httpx to make an async multipart/form-data POST request
            async with httpx.AsyncClient() as client:
                with open(abs_image_path, "rb") as f:
                    files = {"file": (os.path.basename(abs_image_path), f, "image/jpeg")}
                    # Ensure url doesn't double slash
                    endpoint = f"{api_url.rstrip('/')}/extract"
                    
                    logger.info(f"Sending receipt to Colab API at {endpoint}...")
                    response = await client.post(endpoint, files=files, timeout=60.0)
                    
                    if response.status_code != 200:
                        logger.error(f"Colab API returned {response.status_code}: {response.text}")
                        return None
                        
                    data = response.json()
                    logger.info(f"Colab API response: {data}")
                    return data.get("amount")
                    
        except Exception as e:
            logger.error(f"Failed to communicate with Colab API: {e}")
            return None

receipt_extractor = ReceiptExtractorService.get_instance()
