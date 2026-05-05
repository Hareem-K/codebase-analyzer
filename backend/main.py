from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv
from rag_engine import build_rag_chain, generate_summary, ask_question
from fastapi.responses import JSONResponse
import hashlib
import os

load_dotenv()

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Store: repo_url -> {retriever, llm, docs}
sessions = {}

def make_slug(url: str) -> str:
    parts = url.rstrip("/").split("/")
    name = "-".join(parts[-2:]) if len(parts) >= 2 else parts[-1]
    return name.lower().replace("_", "-")

@app.get("/analysis/{slug}")
async def get_analysis(slug: str):
    for url, data in sessions.items():
        if make_slug(url) == slug:
            return {"found": True, "github_url": url}
    return JSONResponse({"found": False}, status_code=404)

class RepoRequest(BaseModel):
    github_url: str

class QuestionRequest(BaseModel):
    github_url: str
    question: str
    chat_history: list = []

@app.post("/analyze")
async def analyze_repo(req: RepoRequest):
    try:
        retriever, llm, docs = build_rag_chain(req.github_url)
        summary = generate_summary(retriever, llm, docs)
        sessions[req.github_url] = {"retriever": retriever, "llm": llm}
        return {
            "summary": summary,
            "file_count": len(docs),
            "files": [d["source"] for d in docs[:100]],
            "slug": make_slug(req.github_url)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/ask")
async def ask(req: QuestionRequest):
    session = sessions.get(req.github_url)
    if not session:
        raise HTTPException(status_code=404, detail="Repo not analyzed yet.")
    try:
        answer = ask_question(
            session["retriever"],
            session["llm"],
            req.question,
            req.chat_history
        )
        return {"answer": answer}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/health")
def health():
    return {"status": "ok"}