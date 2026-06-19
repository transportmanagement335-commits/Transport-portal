with open("frontend/src/api.js", "a", encoding="utf-8") as f:
    f.write("""

// ─── Upload ───────────────────────────────────────────────────────────────────

export const uploadAPI = {
  uploadFile: (file) => {
    const formData = new FormData();
    formData.append("file", file);
    return apiFetch("/upload/", { method: "POST", body: formData });
  }
};
""")
