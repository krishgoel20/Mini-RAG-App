import re
from typing import List, Tuple
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity
import numpy as np

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

class TFIDFIndex:
    def __init__(self) -> None:
        self.chunks: List[str] = []
        self._vectorizer: TfidfVectorizer | None = None
        self._matrix = None

    def build(self,chunks: List[str]) -> None:
        if not chunks:
            raise ValueError("Cannot build index from an empty chunk list.")
        self.chunks = chunks
        self._vectorizer = TfidfVectorizer(
            stop_words="english",
            ngram_range=(1,2),
        )
        self._matrix = self._vectorizer.fit_transform(chunks)

    def search(self,query: str,top_k: int = 3) -> List[Tuple[str,float]]:
        if self._vectorizer is None or self._matrix is None:
            raise RuntimeError("Index not built yet. Call build() first.")
        q_vec = self._vectorizer.transform([query])
        scores = cosine_similarity(q_vec,self._matrix).flatten()
        ranked_indices = np.argsort(scores)[::-1][:top_k]
        results = [(self.chunks[i],float(scores[i])) for i in ranked_indices]
        results = [(chunk,score) for chunk,score in results if score > 0.0]
        return results

def assemble_context(retrieved: List[Tuple[str,float]]) -> str:
    if not retrieved:
        return ""

    lines = ["CONTEXT EXCERPTS (answer strictly based on these):\n"]
    for i, (chunk,score) in enumerate(retrieved,1):
        lines.append(f"[{i}] (relevance: {score:.2f})\n{chunk}\n")

    return "\n".join(lines)