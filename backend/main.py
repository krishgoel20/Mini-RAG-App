import os
import io
import random
from dotenv import load_dotenv
from groq import Groq
from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from rag_engine import TFIDFIndex, chunk_text, assemble_context

load_dotenv(dotenv_path="../.env")

app = FastAPI(title="Mini-RAG API",version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

client = Groq(api_key=os.environ["GROQ_API_KEY"])

# Multiple document support
_documents: dict = {}          # {doc_id: {"name": str, "index": TFIDFIndex, "preview": str}}
_active_doc_id: str | None = None

class UploadRequest(BaseModel):
    text: str

class UploadResponse(BaseModel):
    status: str
    chunks_created: int
    preview: str

class QueryRequest(BaseModel):
    question: str
    top_k: int = 3
    history: list[dict] = []

class QueryResponse(BaseModel):
    answer: str
    sources: list[dict]

class StatusResponse(BaseModel):
    document_loaded: bool
    preview: str

SYSTEM_PROMPT = """You are a precise question-answering assistant.
Your ONLY knowledge source is the context excerpts provided.

Rules you must follow:
1. Answer ONLY using information present in the provided context excerpts.
2. If the answer is not in the context, say exactly: "I could not find an answer in the provided document."
3. Do NOT use any external knowledge or make assumptions beyond the context.
4. Be concise and direct.
5. Never fabricate facts.
6. Detect the language of the context excerpts and answer in that same language.
   For example, if the document is in French, answer in French.
   If the document is in Hindi, answer in Hindi.
"""

def _build_prompt(question: str,context: str) -> str:
    return f"{SYSTEM_PROMPT}\n\n{context}\n\nQUESTION: {question}"

def _call_llm(question: str, context: str, history: list[dict] = []) -> str:
    prompt = _build_prompt(question, context)
    
    messages = []
    for msg in history:
        messages.append({"role": msg["role"], "content": msg["content"]})
    messages.append({"role": "user", "content": prompt})

    response = client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        messages=messages
    )
    return response.choices[0].message.content

def _rewrite_query(question: str, history: list[dict]) -> str:
    if not history:
        return question

    # Only rewrite if the question is clearly a follow-up
    # Self-contained questions don't need rewriting
    follow_up_signals = [
        "it", "that", "this", "first", "second", "third",
        "more", "previous", "last", "above", "same", "one",
        "tell me", "explain", "elaborate", "what about"
    ]
    words = question.lower().split()
    is_follow_up = (
        len(words) <= 8 and
        any(signal in question.lower() for signal in follow_up_signals)
    )

    if not is_follow_up:
        return question  # Self-contained — use as-is

    # Only rewrite genuine follow-up questions
    recent_history = history[-2:] if len(history) > 2 else history
    history_text = ""
    for msg in recent_history:
        role = "User" if msg["role"] == "user" else "Assistant"
        history_text += f"{role}: {msg['content']}\n"

    rewrite_prompt = f"""Given this conversation history:
{history_text}

Rewrite this follow-up question into a standalone search query.
Return ONLY the rewritten query, nothing else.

Follow-up question: {question}
Standalone query:"""

    response = client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        messages=[{"role": "user", "content": rewrite_prompt}],
        max_tokens=100
    )
    return response.choices[0].message.content.strip()

async def _extract_text(file: UploadFile) -> str:
    contents = await file.read()
    filename = file.filename.lower()

    if filename.endswith(".txt"):
        return contents.decode("utf-8")

    elif filename.endswith(".pdf"):
        import fitz  # pymupdf
        doc = fitz.open(stream=contents, filetype="pdf")
        text = ""
        for page in doc:
            text += page.get_text()

        # If no text found, it's a scanned PDF — use OCR
        if not text.strip():
            import easyocr
            import numpy as np
            from PIL import Image
            import io as _io
            reader = easyocr.Reader(['en'], gpu=False)
            for page in doc:
                pix = page.get_pixmap()
                img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
                img_array = np.array(img)
                results = reader.readtext(img_array, detail=0)
                text += " ".join(results) + "\n"

        return text.strip()

    elif filename.endswith(".docx"):
        import docx
        doc = docx.Document(io.BytesIO(contents))
        text = ""
        for para in doc.paragraphs:
            text += para.text + "\n"
        return text.strip()

    else:
        raise HTTPException(
            status_code=400,
            detail="Unsupported file type. Please upload .txt, .pdf, or .docx"
        )

@app.get("/status", response_model=StatusResponse)
def get_status():
    return StatusResponse(
        document_loaded=_active_doc_id is not None,
        preview=_documents[_active_doc_id]["preview"] if _active_doc_id else ""
    )

@app.post("/upload", response_model=UploadResponse)
def upload_document(req: UploadRequest):
    global _active_doc_id

    text = req.text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="Document text cannot be empty.")

    chunks = chunk_text(text, chunk_size=5, overlap=2)
    if not chunks:
        raise HTTPException(status_code=400, detail="Could not extract any text chunks.")

    doc_id = f"doc_{len(_documents) + 1}"
    index = TFIDFIndex()
    index.build(chunks)

    _documents[doc_id] = {
        "name": f"Document {len(_documents) + 1}",
        "index": index,
        "preview": text[:200] + ("…" if len(text) > 200 else "")
    }
    _active_doc_id = doc_id

    return UploadResponse(
        status="ok",
        chunks_created=len(chunks),
        preview=_documents[doc_id]["preview"],
    )

@app.post("/upload-file", response_model=UploadResponse)
async def upload_file(file: UploadFile = File(...)):
    global _active_doc_id

    if not file.filename:
        raise HTTPException(status_code=400, detail="No file provided.")

    text = await _extract_text(file)

    if not text:
        raise HTTPException(status_code=400, detail="Could not extract any text from the file.")

    chunks = chunk_text(text, chunk_size=5, overlap=2)
    if not chunks:
        raise HTTPException(status_code=400, detail="Could not extract any text chunks.")

    doc_id = f"doc_{len(_documents) + 1}"
    index = TFIDFIndex()
    index.build(chunks)

    _documents[doc_id] = {
        "name": file.filename,
        "index": index,
        "preview": text[:200] + ("…" if len(text) > 200 else "")
    }
    _active_doc_id = doc_id

    return UploadResponse(
        status="ok",
        chunks_created=len(chunks),
        preview=_documents[doc_id]["preview"],
    )

@app.post("/query", response_model=QueryResponse)
def query_document(req: QueryRequest):
    if not _active_doc_id or _active_doc_id not in _documents:
        raise HTTPException(
            status_code=400,
            detail="No document loaded. Please upload a document first."
        )

    question = req.question.strip()
    if not question:
        raise HTTPException(status_code=400, detail="Question cannot be empty.")

    doc = _documents[_active_doc_id]
    index = doc["index"]

    # Rewrite follow-up questions into standalone queries
    rewritten = _rewrite_query(question, req.history)

    # Get TF-IDF scores for display
    tfidf_results = index.search(rewritten, top_k=1)

    # For LLM context: pass all chunks for small documents
    if len(index.chunks) <= 5:
        context_chunks = [(chunk, 1.0) for chunk in index.chunks]
    else:
        context_chunks = tfidf_results if tfidf_results else [(chunk, 0.0) for chunk in index.chunks]

    context = assemble_context(context_chunks)
    answer = _call_llm(rewritten, context, req.history)

    # For display: show only top 1 TF-IDF matching chunk
    display_sources = [
        {"rank": 1, "score": round(tfidf_results[0][1], 3), "text": tfidf_results[0][0]}
    ] if tfidf_results else []

    return QueryResponse(answer=answer, sources=display_sources)

@app.post("/reset")
def reset():
    global _active_doc_id
    _documents.clear()
    _active_doc_id = None
    return {"status": "reset"}

@app.get("/documents")
def get_documents():
    return [
        {
            "id": doc_id,
            "name": doc["name"],
            "preview": doc["preview"],
            "active": doc_id == _active_doc_id
        }
        for doc_id, doc in _documents.items()
    ]

@app.post("/documents/{doc_id}/activate")
def activate_document(doc_id: str):
    global _active_doc_id
    if doc_id not in _documents:
        raise HTTPException(status_code=404, detail="Document not found.")
    _active_doc_id = doc_id
    return {"status": "ok", "active": doc_id}

@app.delete("/documents/{doc_id}")
def delete_document(doc_id: str):
    global _active_doc_id
    if doc_id not in _documents:
        raise HTTPException(status_code=404, detail="Document not found.")
    del _documents[doc_id]
    if _active_doc_id == doc_id:
        _active_doc_id = next(iter(_documents), None)
    return {"status": "deleted", "new_active": _active_doc_id}

@app.get("/suggest", response_model=list[str])
def suggest_questions():
    if not _active_doc_id or _active_doc_id not in _documents:
        raise HTTPException(status_code=400, detail="No document loaded.")

    index = _documents[_active_doc_id]["index"]
    sample_chunks = random.sample(
        index.chunks,
        min(2, len(index.chunks))
    )
    preview = " ".join(sample_chunks)[:1000]

    prompt = f"""Based on this document excerpt, generate exactly 3 short and specific questions a user might ask about it.
Return ONLY the 3 questions, one per line, no numbering, no extra text.

Document excerpt:
{preview}

3 questions:"""

    response = client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        messages=[{"role": "user", "content": prompt}],
        max_tokens=150,
        temperature=0.9
    )

    raw = response.choices[0].message.content.strip()
    questions = [q.strip() for q in raw.split("\n") if q.strip()][:3]
    return questions