import os
os.environ["ANONYMIZED_TELEMETRY"] = "False"
import re
import uuid
from typing import List, Tuple
import chromadb
from sentence_transformers import SentenceTransformer

# Loaded once at import time and shared by every document's index —
# reloading a transformer model per document would be wasteful.
_embedding_model = SentenceTransformer("all-MiniLM-L6-v2")

# Single in-memory (ephemeral) Chroma client shared across documents.
# Each EmbeddingIndex gets its own uniquely named collection so that
# documents never share or leak chunks into each other's search space.
_chroma_client = chromadb.Client()

def _split_into_sentences(text: str) -> List[str]:
    text = text.replace("\r\n","\n").replace("\r","\n")
    sentences = re.split(r'(?<=[.!?])\s+(?=[A-Z])',text.strip())
    result: List[str] = []
    for s in sentences:
        parts = [p.strip() for p in s.split("\n\n") if p.strip()]
        result.extend(parts if parts else [s.strip()])
    return [s for s in result if s]

def chunk_text(
    text: str,
    chunk_size: int = 5,
    overlap: int = 2,
) -> List[str]:
    sentences = _split_into_sentences(text)

    if len(sentences) == 0:
        return []

    if len(sentences) <= chunk_size:
        return [" ".join(sentences)]

    chunks: List[str] = []
    step = chunk_size - overlap

    for start in range(0, len(sentences), step):
        window = sentences[start : start + chunk_size]
        chunks.append(" ".join(window))
        if start + chunk_size >= len(sentences):
            break

    return chunks

class EmbeddingIndex:
    """
    Semantic retrieval index backed by sentence-transformer embeddings
    and a ChromaDB collection. Drop-in replacement for the old
    TFIDFIndex: same build()/search()/self.chunks interface, so
    main.py needs no changes beyond the import.
    """

    def __init__(self) -> None:
        self.chunks: List[str] = []
        # Unique collection name per document so indexes never collide,
        # even if several documents are open at once. Configure the
        # space as cosine so distances map cleanly to a similarity score.
        self._collection = _chroma_client.create_collection(
            name=f"doc_{uuid.uuid4().hex}",
            metadata={"hnsw:space": "cosine"},
        )

    def build(self, chunks: List[str]) -> None:
        if not chunks:
            raise ValueError("Cannot build index from an empty chunk list.")
        self.chunks = chunks
        embeddings = _embedding_model.encode(chunks).tolist()
        self._collection.add(
            ids=[str(i) for i in range(len(chunks))],
            embeddings=embeddings,
            documents=chunks,
        )

    def search(self, query: str, top_k: int = 3) -> List[Tuple[str, float]]:
        if not self.chunks:
            raise RuntimeError("Index not built yet. Call build() first.")
        query_embedding = _embedding_model.encode([query]).tolist()
        results = self._collection.query(
            query_embeddings=query_embedding,
            n_results=min(top_k, len(self.chunks)),
        )
        documents = results["documents"][0]
        distances = results["distances"][0]
        # Cosine space -> distance = 1 - cosine_similarity, so convert back.
        scored = [(doc, 1.0 - dist) for doc, dist in zip(documents, distances)]
        return [(chunk, score) for chunk, score in scored if score > 0.0]

    def close(self) -> None:
        """Drop this document's collection. Call when the document is deleted or reset."""
        _chroma_client.delete_collection(name=self._collection.name)

def assemble_context(retrieved: List[Tuple[str,float]]) -> str:
    if not retrieved:
        return ""

    lines = ["CONTEXT EXCERPTS (answer strictly based on these):\n"]
    for i, (chunk,score) in enumerate(retrieved,1):
        lines.append(f"[{i}] (relevance: {score:.2f})\n{chunk}\n")

    return "\n".join(lines)