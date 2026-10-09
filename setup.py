import os
import shutil
import subprocess
import sys

from pathlib import Path


BASE_DIR = Path(__file__).resolve().parent
ENV_FILE = BASE_DIR / ".env"


PYTHON_PACKAGES = [
    "requests",
    "validators",
    "beautifulsoup4",
    "python-dotenv",
    "gpt-researcher",
]


def run_command(command, **kwargs):
    """
    Run a command and raise a useful error if it fails.
    """

    result = subprocess.run(
        command,
        **kwargs
    )

    if result.returncode != 0:
        raise RuntimeError(
            f"Command failed with exit code "
            f"{result.returncode}: {' '.join(command)}"
        )

    return result


def find_executable(*names):
    """
    Find an executable in PATH.

    Windows npm/node tools commonly use .cmd files,
    so we explicitly check those first.
    """

    for name in names:
        path = shutil.which(name)

        if path:
            return path

    return None


def check_python():
    print(f"[OK] Python {sys.version.split()[0]}")


def install_python_packages():
    for package in PYTHON_PACKAGES:

        print(f"Installing {package}...")

        run_command(
            [
                sys.executable,
                "-m",
                "pip",
                "install",
                package
            ]
        )

    print("[OK] Python packages installed")


def get_existing_env():
    """
    Load the existing .env file if it exists.
    """

    values = {}

    if not ENV_FILE.exists():
        return values

    with open(
        ENV_FILE,
        "r",
        encoding="utf-8"
    ) as file:

        for line in file:

            line = line.strip()

            if not line:
                continue

            if line.startswith("#"):
                continue

            if "=" not in line:
                continue

            key, value = line.split(
                "=",
                1
            )

            values[key.strip()] = value.strip()

    return values


def write_env(values):
    """
    Write the HAG .env configuration.
    """

    lines = [
        f"{key}={value}"
        for key, value in values.items()
    ]

    with open(
        ENV_FILE,
        "w",
        encoding="utf-8"
    ) as file:

        file.write(
            "\n".join(lines) + "\n"
        )


def configure_api_keys():
    print()
    print("Hack-A-Gent API configuration")
    print("-----------------------------")
    print()

    env = get_existing_env()

    # NVIDIA
    nvidia_key = input(
        "Enter NVIDIA API key: "
    ).strip()

    if nvidia_key:
        env["OPENAI_API_KEY"] = nvidia_key

    env["OPENAI_BASE_URL"] = (
        "https://integrate.api.nvidia.com/v1"
    )

    env["FAST_LLM"] = (
        "openai:nvidia/nemotron-3-ultra-550b-a55b"
    )

    env["SMART_LLM"] = (
        "openai:nvidia/nemotron-3-ultra-550b-a55b"
    )

    env["STRATEGIC_LLM"] = (
        "openai:nvidia/nemotron-3-ultra-550b-a55b"
    )

    print("NVIDIA API config saved")

    # Tavily
    tavily_key = input(
        "Enter Tavily API key: "
    ).strip()

    if tavily_key:
        env["TAVILY_API_KEY"] = tavily_key

    print("[OK] Tavily API key saved")

    # Gemini
    gemini_key = input(
        "Enter Gemini API key: "
    ).strip()

    if gemini_key:
        env["GEMINI_API_KEY"] = gemini_key

    print("[OK] Gemini API key saved")

    write_env(env)


def install_gemini_cli():
    """
    Install Gemini CLI if it isn't already installed.

    Windows-safe:
    Python subprocess may not resolve npm.ps1,
    so explicitly look for npm.cmd.
    """

    print("Installing Gemini CLI...")

    # Check existing installation first.
    gemini = find_executable(
        "gemini.cmd",
        "gemini"
    )

    if gemini:
        print("[OK] Gemini CLI already installed")
        return gemini

    # Find npm.
    npm = find_executable(
        "npm.cmd",
        "npm"
    )

    if not npm:
        raise RuntimeError(
            "npm was not found in PATH.\n"
            "Install Node.js/npm and restart your terminal."
        )

    print("Installing @google/gemini-cli...")

    result = subprocess.run(
        [
            npm,
            "install",
            "-g",
            "@google/gemini-cli"
        ],
        check=False
    )

    if result.returncode != 0:
        raise RuntimeError(
            "Failed to install Gemini CLI."
        )

    # Verify installation.
    gemini = find_executable(
        "gemini.cmd",
        "gemini"
    )

    if not gemini:
        raise RuntimeError(
            "Gemini CLI was installed but could not "
            "be found in PATH."
        )

    print("[OK] Gemini CLI installed")

    return gemini


def verify_gemini_cli():
    """
    Verify Gemini CLI can be executed.
    """

    gemini = find_executable(
        "gemini.cmd",
        "gemini"
    )

    if not gemini:
        raise RuntimeError(
            "Gemini CLI was not found in PATH."
        )

    result = subprocess.run(
        [
            gemini,
            "--version"
        ],
        capture_output=True,
        text=True,
        check=False
    )

    if result.returncode != 0:
        raise RuntimeError(
            "Gemini CLI could not be executed."
        )

    version = result.stdout.strip()

    print(
        f"[OK] Gemini CLI {version}"
    )


def update_gitignore():
    """
    Make sure sensitive/local files are ignored.
    """

    gitignore = BASE_DIR / ".gitignore"

    existing = ""

    if gitignore.exists():
        existing = gitignore.read_text(
            encoding="utf-8"
        )

    entries = [
        ".env",
        "__pycache__/",
        "*.pyc",
        "projects/",
    ]

    lines = existing.splitlines()

    for entry in entries:

        if entry not in lines:
            lines.append(entry)

    gitignore.write_text(
        "\n".join(lines) + "\n",
        encoding="utf-8"
    )

    print("[OK] .gitignore updated.")


def main():

    print()
    print("================================")
    print("       Hack-A-Gent Setup")
    print("================================")
    print()

    check_python()

    install_python_packages()

    configure_api_keys()

    install_gemini_cli()

    verify_gemini_cli()

    update_gitignore()

    print()
    print("Hack-A-Gent setup completed successfully!")
    print()


if __name__ == "__main__":
    main()