from fastapi import FastAPI
from .routers import transactions

app = FastAPI(title="Budet App API", version="0.1.0")

@app.get("/health")
async def health():
    return {"status": "ok"}

app.include_router(transactions.router)