"""
Hack-A-Gent research + planning engine.

Flow:

hackathon data
      ↓
find_motive()
      ↓
GPT Researcher + NVIDIA NIM
      ↓
research report
      ↓
NVIDIA NIM direct generation
      ↓
structured project idea
      ↓
NVIDIA NIM direct generation
      ↓
implementation plan
      ↓
plan.json
"""

import asyncio
import json
import os
import re
import time
from typing import Any, Dict

from dotenv import load_dotenv


# =========================================================
# ENVIRONMENT
# =========================================================

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

load_dotenv(
    os.path.join(BASE_DIR, ".env")
)

required_environment = [
    "OPENAI_API_KEY",
    "OPENAI_BASE_URL",
    "TAVILY_API_KEY",
]

missing = [
    variable
    for variable in required_environment
    if not os.getenv(variable)
]

if missing:
    raise RuntimeError(
        "Missing environment variables: "
        + ", ".join(missing)
    )


# =========================================================
# NVIDIA NIM / GPT RESEARCHER CONFIG
# =========================================================

os.environ["OPENAI_API_KEY"] = os.getenv(
    "OPENAI_API_KEY"
)

os.environ["OPENAI_BASE_URL"] = os.getenv(
    "OPENAI_BASE_URL"
)

os.environ["TAVILY_API_KEY"] = os.getenv(
    "TAVILY_API_KEY"
)

# GPT Researcher expects the OpenAI-compatible
# provider prefix in these variables.
NVIDIA_MODEL = os.getenv(
    "NVIDIA_MODEL",
    "nvidia/nemotron-3-ultra-550b-a55b"
)

RESEARCHER_MODEL = (
    "openai:" + NVIDIA_MODEL
    if not NVIDIA_MODEL.startswith("openai:")
    else NVIDIA_MODEL
)

os.environ["FAST_LLM"] = os.getenv(
    "FAST_LLM",
    RESEARCHER_MODEL
)

os.environ["SMART_LLM"] = os.getenv(
    "SMART_LLM",
    RESEARCHER_MODEL
)

os.environ["STRATEGIC_LLM"] = os.getenv(
    "STRATEGIC_LLM",
    RESEARCHER_MODEL
)

# HAG uses normal web research.
os.environ["RETRIEVER"] = "tavily"


# Import after environment is configured.
from gpt_researcher import GPTResearcher


# =========================================================
# NVIDIA NIM DIRECT CLIENT
# =========================================================

try:
    from openai import OpenAI
except ImportError:
    OpenAI = None


def get_nvidia_client():

    if OpenAI is None:
        raise RuntimeError(
            "The 'openai' package is required for "
            "NVIDIA NIM's OpenAI-compatible API.\n"
            "Install it with:\n"
            "pip install -U openai"
        )

    return OpenAI(
        api_key=os.getenv("OPENAI_API_KEY"),
        base_url=os.getenv("OPENAI_BASE_URL"),
    )


# =========================================================
# FIND HACKATHON MOTIVE
# =========================================================

def find_motive(
    hackathon: dict
) -> str:

    sections = hackathon.get(
        "sections",
        {}
    )

    if sections:

        preferred_sections = [
            "what to build",
            "challenge",
            "the challenge",
            "problem",
            "the problem",
            "objective",
            "goal",
            "purpose",
            "about",
            "description",
        ]

        # -------------------------------------------------
        # Exact section match
        # -------------------------------------------------

        for preferred in preferred_sections:

            for section_name, content in sections.items():

                if (
                    section_name.strip().lower()
                    == preferred
                ):

                    if content and content.strip():
                        return content.strip()

        # -------------------------------------------------
        # Partial section match
        # -------------------------------------------------

        keywords = [
            "what to build",
            "challenge",
            "problem",
            "objective",
            "goal",
            "purpose",
            "build",
        ]

        for section_name, content in sections.items():

            name = section_name.strip().lower()

            if any(
                keyword in name
                for keyword in keywords
            ):

                if content and content.strip():
                    return content.strip()

    # -----------------------------------------------------
    # Raw page fallback
    # -----------------------------------------------------

    raw_text = hackathon.get(
        "raw_text",
        ""
    )

    if raw_text and raw_text.strip():
        return raw_text.strip()

    # -----------------------------------------------------
    # Description fallback
    # -----------------------------------------------------

    description = hackathon.get(
        "description",
        ""
    )

    if description and description.strip():
        return description.strip()

    return (
        "No hackathon requirements "
        "could be extracted."
    )


# =========================================================
# GPT RESEARCHER
# =========================================================

async def _research_once(
    query: str
) -> str:

    researcher = GPTResearcher(
        query=query,
        report_type="research_report",
        verbose=False,
    )

    await researcher.conduct_research()

    report = await researcher.write_report()

    if not report or not report.strip():

        raise RuntimeError(
            "GPT Researcher returned "
            "an empty report."
        )

    return report.strip()


async def get_report(
    query: str,
    retries: int = 3
) -> str:
    """
    Run GPT Researcher with limited retry/backoff.

    We deliberately do not hammer NVIDIA NIM repeatedly.
    """

    last_error = None

    for attempt in range(
        1,
        retries + 1
    ):

        try:

            print(
                f"Research attempt "
                f"{attempt}/{retries}..."
            )

            return await _research_once(
                query
            )

        except Exception as error:

            last_error = error

            print(
                f"Research attempt "
                f"{attempt} failed: {error}"
            )

            if attempt >= retries:
                break

            delay = 5 * (
                2 ** (attempt - 1)
            )

            print(
                f"Waiting {delay}s "
                "before retry..."
            )

            await asyncio.sleep(
                delay
            )

    raise RuntimeError(
        "NVIDIA/GPT Researcher failed "
        f"after {retries} attempts: "
        f"{last_error}"
    )


# =========================================================
# NVIDIA NIM DIRECT GENERATION
# =========================================================

def nvidia_generate(
    system_prompt: str,
    user_prompt: str,
    retries: int = 4
) -> str:
    """
    Direct NVIDIA NIM generation.

    Uses the OpenAI-compatible NVIDIA NIM API.

    Example endpoint:

        https://integrate.api.nvidia.com/v1
    """

    client = get_nvidia_client()

    last_error = None

    for attempt in range(
        1,
        retries + 1
    ):

        try:

            print(
                f"NVIDIA NIM generation "
                f"{attempt}/{retries}..."
            )

            response = client.chat.completions.create(
                model=NVIDIA_MODEL,

                messages=[
                    {
                        "role": "system",
                        "content": system_prompt,
                    },
                    {
                        "role": "user",
                        "content": user_prompt,
                    },
                ],

                temperature=0.7,

                max_tokens=6000,

                # NVIDIA's OpenAI-compatible
                # endpoint supports JSON response
                # formatting on compatible models.
                response_format={
                    "type": "json_object"
                },
            )

            if not response.choices:
                raise RuntimeError(
                    "NVIDIA NIM returned "
                    "no choices."
                )

            content = (
                response
                .choices[0]
                .message
                .content
            )

            if not content:
                raise RuntimeError(
                    "NVIDIA NIM returned "
                    "an empty response."
                )

            return content.strip()

        except Exception as error:

            last_error = error

            print(
                f"NVIDIA NIM attempt "
                f"{attempt} failed: {error}"
            )

            if attempt >= retries:
                break

            delay = 5 * (
                2 ** (attempt - 1)
            )

            print(
                f"Waiting {delay}s "
                "before retry..."
            )

            time.sleep(delay)

    raise RuntimeError(
        "NVIDIA NIM generation failed "
        f"after {retries} attempts: "
        f"{last_error}"
    )


# =========================================================
# JSON PARSER
# =========================================================

def parse_json_response(
    text: str
) -> Dict[str, Any]:

    if not text or not text.strip():

        raise ValueError(
            "Cannot parse empty AI response."
        )

    cleaned = text.strip()

    # Remove accidental Markdown fences.
    cleaned = re.sub(
        r"^```json\s*",
        "",
        cleaned,
        flags=re.IGNORECASE
    )

    cleaned = re.sub(
        r"^```\s*",
        "",
        cleaned
    )

    cleaned = re.sub(
        r"\s*```$",
        "",
        cleaned
    )

    # -----------------------------------------------------
    # Direct JSON
    # -----------------------------------------------------

    try:

        parsed = json.loads(
            cleaned
        )

        if isinstance(
            parsed,
            dict
        ):
            return parsed

    except json.JSONDecodeError:
        pass

    # -----------------------------------------------------
    # Find JSON object inside response
    # -----------------------------------------------------

    start = cleaned.find("{")

    if start == -1:

        raise ValueError(
            "AI response did not contain "
            "a JSON object."
        )

    depth = 0
    in_string = False
    escaped = False

    for index in range(
        start,
        len(cleaned)
    ):

        char = cleaned[index]

        if escaped:

            escaped = False
            continue

        if char == "\\":

            escaped = True
            continue

        if char == '"':

            in_string = not in_string
            continue

        if in_string:
            continue

        if char == "{":

            depth += 1

        elif char == "}":

            depth -= 1

            if depth == 0:

                candidate = cleaned[
                    start:index + 1
                ]

                try:

                    parsed = json.loads(
                        candidate
                    )

                    if isinstance(
                        parsed,
                        dict
                    ):
                        return parsed

                except json.JSONDecodeError:
                    break

    raise ValueError(
        "Could not extract valid JSON "
        "from AI response."
    )


# =========================================================
# PROJECT IDEA GENERATION
# =========================================================

def generate_project_idea(
    hackathon: dict,
    motive: str,
    research: str
) -> Dict[str, Any]:

    system_prompt = """
You are Hack-A-Gent's project ideation engine.

Your task is to design ONE exceptional hackathon project.

The project must:

- genuinely satisfy the hackathon
- solve a real problem
- be technically realistic
- have an impressive live demo
- be differentiated
- use the required hackathon technology centrally
- be buildable during a hackathon

Do NOT provide multiple ideas.

Return ONLY valid JSON.

Do not use Markdown.
Do not add commentary.
Do not add text outside the JSON.
"""

    user_prompt = f"""
HACKATHON:

{hackathon.get(
    "title",
    "Unknown hackathon"
)}

DESCRIPTION:

{hackathon.get(
    "description",
    "No description provided."
)}

REQUIREMENTS / MOTIVE:

{motive}

RESEARCH:

{research}

Now design ONE strong project.

Return exactly this structure:

{{
  "project_name": "Project name",
  "problem": "Real problem being solved",
  "solution": "Detailed explanation of the solution",
  "target_users": "Who would use it",
  "why_it_fits": "Why this strongly satisfies the hackathon",
  "what_makes_it_stand_out": "Why this is differentiated",
  "core_functionality": [
    "Feature 1",
    "Feature 2",
    "Feature 3",
    "Feature 4"
  ]
}}

Rules:

1. ONE project only.
2. No alternatives.
3. No generic AI chatbot wrapper.
4. Required hackathon technology must be central.
5. The demo should be visually and technically compelling.
6. Keep the MVP realistic.
"""

    raw = nvidia_generate(
        system_prompt,
        user_prompt
    )

    project = parse_json_response(
        raw
    )

    required_fields = [
        "project_name",
        "problem",
        "solution",
        "target_users",
        "why_it_fits",
        "what_makes_it_stand_out",
        "core_functionality",
    ]

    missing_fields = [
        field
        for field in required_fields
        if not project.get(field)
    ]

    if missing_fields:

        raise ValueError(
            "Incomplete NVIDIA response. "
            "Missing fields: "
            + ", ".join(
                missing_fields
            )
        )

    if not isinstance(
        project["core_functionality"],
        list
    ):

        project["core_functionality"] = [
            str(
                project[
                    "core_functionality"
                ]
            )
        ]

    return project


# =========================================================
# FORMAT PROJECT IDEA
# =========================================================

def format_project_idea(
    project: Dict[str, Any]
) -> str:

    functionality = project[
        "core_functionality"
    ]

    functionality_text = "\n".join(
        f"- {feature}"
        for feature in functionality
    )

    return f"""Project name: {project["project_name"]}

Problem: {project["problem"]}

Solution: {project["solution"]}

Target users: {project["target_users"]}

Why it fits the hackathon: {project["why_it_fits"]}

What makes it stand out: {project["what_makes_it_stand_out"]}

Core functionality:
{functionality_text}
"""


# =========================================================
# IMPLEMENTATION PLAN
# =========================================================

def generate_plan(
    idea: str
) -> str:

    system_prompt = """
You are Hack-A-Gent's implementation planning engine.

Create a practical engineering plan for the supplied
hackathon project.

Prioritize:

1. Working MVP
2. Required hackathon technology
3. Strong live demo
4. Technical feasibility
5. Clear implementation order

Return ONLY valid JSON.

Do not suggest alternative projects.
"""

    user_prompt = f"""
PROJECT:

{idea}

Create the implementation plan.

Return exactly:

{{
  "project_overview": "string",

  "must_have": [
    "feature",
    "feature"
  ],

  "should_have": [
    "feature",
    "feature"
  ],

  "nice_to_have": [
    "feature",
    "feature"
  ],

  "technical_architecture": [
    "component",
    "component"
  ],

  "technology_stack": [
    "technology",
    "technology"
  ],

  "implementation_steps": [
    "step",
    "step",
    "step"
  ],

  "ai_components": [
    "component"
  ],

  "data_and_api_requirements": [
    "requirement"
  ],

  "demo_strategy": [
    "step"
  ],

  "judging_strategy": [
    "point"
  ],

  "risks_and_mitigations": [
    {{
      "risk": "string",
      "mitigation": "string"
    }}
  ]
}}

Prioritize a working MVP first.
"""

    raw = nvidia_generate(
        system_prompt,
        user_prompt
    )

    plan = parse_json_response(
        raw
    )

    required_fields = [
        "project_overview",
        "must_have",
        "should_have",
        "nice_to_have",
        "technical_architecture",
        "technology_stack",
        "implementation_steps",
        "ai_components",
        "data_and_api_requirements",
        "demo_strategy",
        "judging_strategy",
        "risks_and_mitigations",
    ]

    missing_fields = [
        field
        for field in required_fields
        if field not in plan
    ]

    if missing_fields:

        raise ValueError(
            "Incomplete implementation plan. "
            "Missing fields: "
            + ", ".join(
                missing_fields
            )
        )

    # Return formatted JSON so plan.json
    # remains clean and useful to coder.py.
    return json.dumps(
        plan,
        indent=2,
        ensure_ascii=False
    )


# =========================================================
# PROJECT NAME EXTRACTION
# =========================================================

def extract_project_name(
    idea: str
) -> str:

    if not idea or not idea.strip():

        raise ValueError(
            "Cannot extract project name "
            "from empty response."
        )

    # -----------------------------------------------------
    # JSON
    # -----------------------------------------------------

    try:

        parsed = parse_json_response(
            idea
        )

        name = parsed.get(
            "project_name"
        )

        if name and str(name).strip():

            return str(
                name
            ).strip()

    except Exception:
        pass

    # -----------------------------------------------------
    # Plain text fallback
    # -----------------------------------------------------

    patterns = [

        r"(?im)^\s*#{1,6}\s*"
        r"project\s+name\s*:\s*(.+?)\s*$",

        r"(?im)^\s*\*{0,2}\s*"
        r"project\s+name\s*\*{0,2}"
        r"\s*:\s*(.+?)\s*$",

        r"(?im)^\s*project\s+name"
        r"\s*:\s*(.+?)\s*$",
    ]

    for pattern in patterns:

        match = re.search(
            pattern,
            idea
        )

        if match:

            name = match.group(
                1
            ).strip()

            name = name.strip(
                "*`# "
            )

            if name:
                return name

    raise ValueError(
        "The AI response did not contain "
        "a recognizable project name."
    )


# =========================================================
# ANALYSE HACKATHON
# =========================================================

def analyse_hackathon(
    hackathon: dict
) -> str:

    motive = find_motive(
        hackathon
    )

    research_query = f"""
Research this hackathon thoroughly.

The goal is to provide research to another AI
that will design ONE strong project.

Hackathon:
{hackathon.get(
    "title",
    "Unknown hackathon"
)}

Description:
{hackathon.get(
    "description",
    "No description provided."
)}

Requirements / motive:
{motive}

Research:

- official hackathon requirements
- judging criteria
- required technologies
- relevant APIs and SDKs
- existing solutions
- competing products
- common hackathon ideas
- ideas that would be too generic
- differentiation opportunities
- realistic implementation approaches
- strong live demo opportunities

Do NOT generate the final project idea.

Return research only.
"""

    research = asyncio.run(
        get_report(
            research_query
        )
    )

    if not research.strip():

        raise RuntimeError(
            "GPT Researcher returned "
            "an empty research report."
        )

    print(
        "Research completed."
    )

    print(
        "Generating project idea "
        "with NVIDIA NIM..."
    )

    project = generate_project_idea(
        hackathon=hackathon,
        motive=motive,
        research=research
    )

    idea = format_project_idea(
        project
    )

    return idea


# =========================================================
# RUN ANALYSER
# =========================================================

def run_analyser(
    hackathon: dict
) -> dict:

    print(
        "Researching hackathon..."
    )

    idea = analyse_hackathon(
        hackathon
    )

    if not idea.strip():

        raise RuntimeError(
            "Project generation returned "
            "an empty idea."
        )

    project_name = extract_project_name(
        idea
    )

    print(
        f"Project idea: {project_name}"
    )

    print(
        "Creating implementation plan "
        "with NVIDIA NIM..."
    )

    plan = generate_plan(
        idea
    )

    if not plan.strip():

        raise RuntimeError(
            "NVIDIA NIM returned an empty "
            "implementation plan."
        )

    print(
        "Implementation plan created."
    )

    output = {
        "hackathon": hackathon.get(
            "title"
        ),

        "project_name": project_name,

        "idea": idea,

        "plan": plan,
    }

    output_path = os.path.join(
        BASE_DIR,
        "plan.json"
    )

    with open(
        output_path,
        "w",
        encoding="utf-8"
    ) as file:

        json.dump(
            output,
            file,
            indent=2,
            ensure_ascii=False
        )

    print(
        "Saved plan.json"
    )

    return output