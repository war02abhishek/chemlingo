import os
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from langchain_core.prompts import PromptTemplate
from langchain_core.output_parsers import StrOutputParser

load_dotenv()

app = FastAPI(title="ChemLingo AI Service")

# Model selection via env — swap between Gemini and OpenAI without code changes
def get_llm():
    provider = os.getenv("LLM_PROVIDER", "gemini")
    if provider == "openai":
        from langchain_openai import ChatOpenAI
        return ChatOpenAI(model="gpt-4o-mini", temperature=0.3)
    from langchain_google_genai import ChatGoogleGenerativeAI
    return ChatGoogleGenerativeAI(model="gemini-1.5-flash", temperature=0.3)


from prompts.hint_template import HINT_TEMPLATE

hint_chain = (
    PromptTemplate.from_template(HINT_TEMPLATE)
    | get_llm()
    | StrOutputParser()
)


class HintRequest(BaseModel):
    question_data: dict
    student_answer: str
    correct_answer: str


class VariationRequest(BaseModel):
    base_fact: str  # e.g. "XeF4 hydrolysis products"
    drill_type: str
    count: int = 3


@app.post("/hint")
async def get_hint(req: HintRequest):
    try:
        hint = await hint_chain.ainvoke({
            "question_data": req.question_data,
            "student_answer": req.student_answer,
            "correct_answer": req.correct_answer,
        })
        return {"hint": hint}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


VARIATION_TEMPLATE = """You are a JEE/NEET question generator for Inorganic Chemistry.

Base fact: {base_fact}
Drill type: {drill_type}

Generate {count} unique drill question variations as a JSON array.
Each item must have: "question_data" (object) and "correct_answer" (object).
Return ONLY valid JSON, no explanation."""

variation_chain = (
    PromptTemplate.from_template(VARIATION_TEMPLATE)
    | get_llm()
    | StrOutputParser()
)


@app.post("/variations")
async def generate_variations(req: VariationRequest):
    try:
        result = await variation_chain.ainvoke({
            "base_fact": req.base_fact,
            "drill_type": req.drill_type,
            "count": req.count,
        })
        import json
        return {"variations": json.loads(result)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/health")
def health():
    return {"status": "ok"}
