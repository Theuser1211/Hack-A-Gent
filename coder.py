import json
import os
import re
import shutil
import subprocess


def sanitize_project_name(name: str) -> str:
    """
    Convert the AI-generated project name into a safe folder name.
    """

    name = name.strip()

    # Remove characters that Windows does not allow
    name = re.sub(r'[<>:"/\\|?*]', "", name)

    # Collapse multiple spaces
    name = re.sub(r"\s+", " ", name)

    # Remove trailing dots/spaces
    name = name.rstrip(". ")

    if not name:
        raise ValueError(
            "Project name is empty after sanitization."
        )

    return name


def load_plan(plan_file: str) -> dict:
    """
    Load plan.json.
    """

    if not os.path.exists(plan_file):
        raise FileNotFoundError(
            f"Plan file not found: {plan_file}"
        )

    with open(
        plan_file,
        "r",
        encoding="utf-8"
    ) as file:
        plan = json.load(file)

    if not isinstance(plan, dict):
        raise ValueError(
            "plan.json must contain a JSON object."
        )

    return plan


def find_gemini() -> str:
    """
    Find Gemini CLI executable.
    """

    candidates = [
        "gemini.cmd",
        "gemini"
    ]

    for candidate in candidates:
        path = shutil.which(candidate)

        if path:
            return path

    raise FileNotFoundError(
        "Gemini CLI was not found in PATH. "
        "Install it with: npm install -g @google/gemini-cli"
    )


def run_coder(plan_file: str = "plan.json"):
    """
    Create the project workspace and run Gemini CLI
    inside that workspace.
    """

    plan = load_plan(plan_file)

    project_name = plan.get("project_name")

    if not project_name:
        raise ValueError(
            "plan.json does not contain 'project_name'."
        )

    project_name = sanitize_project_name(project_name)

    base_directory = os.path.dirname(
        os.path.abspath(__file__)
    )

    projects_directory = os.path.join(
        base_directory,
        "projects"
    )

    project_directory = os.path.join(
        projects_directory,
        project_name
    )

    os.makedirs(
        project_directory,
        exist_ok=True
    )

    print(f"Project: {project_name}")
    print(f"Workspace: {project_directory}")
    print("Starting Gemini CLI...")

    gemini = find_gemini()

    plan_path = os.path.abspath(plan_file)

    prompt = f"""
You are the coding worker for Hack-A-Gent.

Build the hackathon project described in this implementation plan:

{plan_path}

First, read and understand the plan completely.

Then ACTUALLY BUILD THE PROJECT.

Requirements:

1. Work directly inside the current directory.
2. Do not create another project directory.
3. Implement the MUST HAVE features first.
4. Follow the technology stack specified in the plan.
5. Create all required source files.
6. Install required dependencies when necessary.
7. Make the project runnable.
8. Do not merely explain the implementation.
9. Do not return a tutorial instead of building the project.
10. Run appropriate tests, builds, or checks when practical.
11. Fix errors that you encounter.
12. Continue working until the MVP is actually implemented.

Prioritize:

MUST HAVE
    ↓
SHOULD HAVE
    ↓
NICE TO HAVE

The final result should be the actual working project files
inside the current directory.
"""

    command = [
        gemini,
        "--prompt",
        prompt,
        "--output-format",
        "json"
    ]

    result = subprocess.run(
        command,
        cwd=project_directory,
        text=True
    )

    if result.returncode != 0:
        raise RuntimeError(
            f"Gemini CLI failed with exit code "
            f"{result.returncode}."
        )

    print("Gemini CLI finished.")