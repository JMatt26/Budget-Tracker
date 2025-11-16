from fastapi import FastAPI
from .db import lifespan
from .routers.transactions import router as tx_router

app = FastAPI(title="Budet App API", version="0.1.0", lifespan=lifespan)

@app.get("/health")
async def health():
    return {"status": "ok"}

app.include_router(tx_router, prefix="/api/transactions", tags=["transactions"])