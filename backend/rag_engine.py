import os, tempfile, shutil
from git import Repo
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_anthropic import ChatAnthropic
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_chroma import Chroma
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain_core.messages import HumanMessage, AIMessage

SUPPORTED_EXTENSIONS = {
    '.py', '.js', '.ts', '.jsx', '.tsx', '.java', '.go',
    '.rs', '.cpp', '.c', '.h', '.cs', '.rb', '.php',
    '.swift', '.kt', '.md', '.yaml', '.yml', '.json', '.toml'
}

SKIP_DIRS = {'node_modules', '.git', '__pycache__', '.venv', 'dist', 'build', '.next'}

def load_repo(github_url: str):
    tmp_dir = tempfile.mkdtemp()
    Repo.clone_from(github_url, tmp_dir)
    docs = []
    for root, dirs, files in os.walk(tmp_dir):
        dirs[:] = [d for d in dirs if d not in SKIP_DIRS]
        for file in files:
            ext = os.path.splitext(file)[1]
            if ext not in SUPPORTED_EXTENSIONS:
                continue
            path = os.path.join(root, file)
            rel_path = os.path.relpath(path, tmp_dir)
            try:
                with open(path, 'r', encoding='utf-8', errors='ignore') as f:
                    content = f.read()
                if content.strip():
                    docs.append({"content": content, "source": rel_path})
            except Exception:
                pass
    import stat
    def remove_readonly(func, path, _):
        os.chmod(path, stat.S_IWRITE)
        func(path)
    shutil.rmtree(tmp_dir, onerror=remove_readonly)
    return docs

def build_rag_chain(github_url: str):
    docs = load_repo(github_url)

    splitter = RecursiveCharacterTextSplitter(chunk_size=1500, chunk_overlap=200)
    chunks = []
    for doc in docs:
        splits = splitter.create_documents(
            [doc["content"]],
            metadatas=[{"source": doc["source"]}]
        )
        chunks.extend(splits)

    embeddings = HuggingFaceEmbeddings(
        model_name="sentence-transformers/all-MiniLM-L6-v2"
    )
    vectorstore = Chroma.from_documents(chunks, embeddings)
    retriever = vectorstore.as_retriever(search_kwargs={"k": 8})

    llm = ChatAnthropic(model="claude-sonnet-4-5", max_tokens=4096)

    return retriever, llm, docs

def ask_question(retriever, llm, question: str, chat_history: list) -> str:
    # Get relevant docs
    relevant_docs = retriever.invoke(question)
    context = "\n\n".join([f"File: {d.metadata.get('source','')}\n{d.page_content}" for d in relevant_docs])

    # Build messages
    messages = []
    for msg in chat_history:
        if msg["role"] == "user":
            messages.append(HumanMessage(content=msg["text"]))
        else:
            messages.append(AIMessage(content=msg["text"]))

    system = f"""You are an expert code analyst. Answer questions about the codebase using the context below.
Be specific, technical, and reference actual file names and functions when relevant.

CODEBASE CONTEXT:
{context}"""

    messages.insert(0, {"role": "system", "content": system})
    messages.append(HumanMessage(content=question))

    response = llm.invoke(messages)
    return response.content

def generate_summary(retriever, llm, docs) -> str:
    file_list = "\n".join([d["source"] for d in docs[:60]])
    question = f"""Analyze this codebase and provide a comprehensive summary covering:

1. **Project Overview** - What does this project do?
2. **Architecture** - How is the codebase structured? What patterns are used?
3. **Key Components** - Main files/modules and their roles
4. **Tech Stack** - Languages, frameworks, and dependencies detected
5. **Code Flow** - How does data/control flow through the app?
6. **Entry Points** - Where does execution begin?

Files in the repo:
{file_list}

Be specific, technical, and thorough."""

    return ask_question(retriever, llm, question, [])