# InsightRAG 📄

A full-stack AI-powered web application that lets you upload documents and ask questions about them in plain English, receiving answers grounded strictly in the uploaded content using Retrieval-Augmented Generation (RAG).

---

## What it does

- Upload a document (.txt, .pdf, or .docx) or paste text directly
- The app chunks the document and builds a semantic (embeddings-based) retrieval index
- Ask any question about the document in plain English
- Relevant chunks are retrieved by meaning, not just keyword overlap, and injected into a grounding prompt
- The LLM generates an answer strictly based on the document content
- Supports chat history, follow-up questions, voice input, and multi-language documents

Answers are always grounded in the document — the LLM cannot fabricate information from outside the uploaded content.

---

## Tech Stack

| Layer     | Technology                              |
|-----------|-----------------------------------------|
| Backend   | Python, FastAPI                         |
| AI / LLM  | Groq API (openai/gpt-oss-120b)      |
| Retrieval | Semantic search — sentence-transformers (all-MiniLM-L6-v2) + ChromaDB |
| OCR       | EasyOCR + PyMuPDF (for scanned PDFs)   |
| Frontend  | HTML, CSS, JS                   |

---

## How it works

```
User uploads document
        ↓
Text extracted (pypdf / python-docx / EasyOCR for scanned PDFs)
        ↓
Document chunked into overlapping sentence windows
        ↓
Chunks embedded (sentence-transformers) and stored in a ChromaDB collection
        ↓
User asks a question
        ↓
Query rewritten (if follow-up) → question embedded → semantic search in ChromaDB
        ↓
Top chunks (by cosine similarity) assembled into context block
        ↓
Groq LLM generates grounded answer
        ↓
Answer displayed with confidence score and highlighted source chunk
```

---

## Project Structure

```
Mini-RAG-App/
├── backend/
│   ├── main.py          # FastAPI app, all endpoints, LLM calls
│   ├── rag_engine.py    # Chunking, embeddings index (sentence-transformers + ChromaDB), context assembly
│   └── requirements.txt
└── frontend/
    ├── index.html       # App structure and layout
    ├── style.css        # Dark/light theme styling
    └── app.js           # API calls, chat UI, highlighting, voice input
```

---

## Setup and Installation

### Pre-requisites
- Python 3.10+
- Groq API key (free at https://console.groq.com)

### 1. Clone the repository

```bash
git clone https://github.com/krishgoel20/Mini-RAG-App.git
cd Mini-RAG-App
```

### 2. Set up the backend

```bash
cd backend
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
```

### 3. Configure environment variables

Create a `.env` file inside the root folder:

```
GROQ_API_KEY=your_groq_api_key_here
```

### 4. Run the backend

```bash
uvicorn main:app --reload --port 8000
```

### 5. Open the frontend

Open `frontend/index.html` directly in your browser, or use VS Code Live Server.

---

## Features

| Feature | Description |
|---|---|
| Multi-format upload | Supports .txt, .pdf, and .docx files |
| OCR support | Extracts text from scanned/image PDFs using EasyOCR |
| Drag and drop | Drag files directly into the upload zone |
| File processing spinner | Contextual loading messages during ingestion (Reading PDF…, Extracting text…) |
| Multiple documents | Upload and switch between multiple documents |
| Soft document limit warning | Amber warning shown when 6+ documents are loaded |
| Reset functionality | Clears all documents, indexes and chat history in one click |
| Chat history | Full conversation memory with follow-up question support |
| Query rewriting | Vague follow-ups rewritten into standalone queries before retrieval |
| Answer highlighting | Most relevant sentences highlighted in retrieved chunks |
| Question suggestions | 3 auto-generated clickable questions after ingestion |
| Confidence indicator | Visual progress bar showing retrieval confidence |
| Word/character count | Shown below each answer bubble |
| Copy answer | One-click copy button on every answer |
| Download chat | Export full conversation as a .txt file |
| Voice input | Ask questions by speaking using Web Speech API |
| Multi-language | Detects document language and answers in the same language |
| Dark/Light mode | Toggle between themes, preference saved in localStorage |
| Irrelevant question handling | Returns grounded "not found" response for off-topic questions |

---

## Sample Questions to Try

```
What is the main argument of this document?
Summarize the document.
What are the key skills listed?
What projects have been built?
Tell me more about the first one.   ← follow-up question
What certifications are mentioned?
What is the educational background?
```

---

## Key Concepts Demonstrated

- **RAG fundamentals** — chunking with overlap, sentence-transformer embeddings, ChromaDB vector storage, cosine-similarity retrieval, context assembly, and grounded generation.
- **Prompt engineering** — strict grounding system prompt prevents hallucination; query rewriting handles conversational follow-ups.
- **Backend–frontend integration** — FastAPI backend with Pydantic validation, CORS middleware, and vanilla JS frontend using the Fetch API.
- **OCR pipeline** — PyMuPDF for digital PDFs with EasyOCR fallback for scanned documents.
- **Multi-document management** — each document gets its own ChromaDB collection in memory; documents can be switched or deleted independently, with collections cleaned up on delete/reset.
- **Async file handling** — large file uploads processed asynchronously to prevent server blocking.

---

## Limitations

- **In-memory storage** — all documents, chat history, and ChromaDB collections are lost on server restart.
- Confidence scores reflect whole-chunk similarity, not answer correctness. A correct answer can still show moderate confidence if it's retrieved from a large chunk that also contains several unrelated topics (e.g. a dense resume section spanning skills, awards, and certifications in one window) — the chunk's overall embedding is diluted by the unrelated content even though the specific answer is present. Documents with more topically coherent chunks (e.g. structured research papers) tend to show higher, more representative confidence scores. (Future improvement: section-aware chunking that splits on headers/bullets instead of fixed sentence windows.).
- OCR accuracy depends on scan quality; handwritten documents are less reliable.
- Not deployed (runs locally only).
- Voice input works only in Chrome and Edge (Web Speech API limitation).

---

## Changelog
 
**Retrieval upgrade — TF-IDF → semantic search**
- Replaced scikit-learn TF-IDF retrieval with `sentence-transformers` (`all-MiniLM-L6-v2`) embeddings stored in per-document ChromaDB collections, enabling meaning-based retrieval instead of keyword overlap (e.g. a question with zero shared vocabulary with the source text can now still retrieve the correct chunk).
- Recalibrated the frontend confidence-bar scaling for cosine-similarity score ranges; the previous linear multiplier was tuned for TF-IDF's sparser score distribution and compressed most real matches toward a misleading 90–95% regardless of actual match quality.
- Fixed a follow-up-detection bug in query rewriting (`_rewrite_query`) where single-word signals like `"it"` were matched as raw substrings instead of whole words, causing false positives on unrelated words like "capital" or "recognition" — this could silently corrupt a question's meaning mid-conversation by rewriting it using irrelevant chat history.
- Updated the Groq model reference from the deprecated `llama-3.3-70b-versatile` to `openai/gpt-oss-120b`.

---

## Upgrade Path

| Current | Upgrade |
|---|---|
| ~~TF-IDF retrieval~~ **✅ Done** | Semantic search via sentence-transformers + ChromaDB |
| Section-agnostic sentence-window chunking | Section-aware chunking (split on headers/bullets) for more coherent chunks and more representative confidence scores |
| In-memory index | SQLite or PostgreSQL for persistent document storage |
| Groq (Llama) | OpenAI GPT-4o or Anthropic Claude for higher answer quality |
| Local only | Deploy backend on Railway/Render, frontend on Vercel |
| Single user | Add authentication for multi-user support |
