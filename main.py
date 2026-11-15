# main script for Hack-A-Gent

import os
import sys
from pathlib import Path

import requests
import validators

from scrapper import scrape_hackathon, save_hackathon
from analyser import run_analyser
from coder import run_coder


def get_app_dir() -> Path:
    """Return the directory containing the executable (or script when unbundled)."""
    if getattr(sys, "frozen", False):
        return Path(sys.executable).resolve().parent
    return Path(__file__).resolve().parent


APP_DIR = get_app_dir()
ENV_FILE = APP_DIR / ".env"
CONFIG_FILE = APP_DIR / "config.json"


def load_local_env(env_path: Path) -> None:
    """Load KEY=VALUE pairs from a .env file next to the executable into os.environ."""
    if not env_path.exists():
        return
    for raw_line in env_path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def ensure_setup() -> None:
    """Run one-time setup if config/env is missing or --setup flag is passed."""
    force_setup = "--setup" in sys.argv
    is_configured = ENV_FILE.exists() or CONFIG_FILE.exists()

    if force_setup or not is_configured:
        print("Running Hack-A-Gent first-time setup...")
        # Importing inside this check supports both top-level setup scripts
        # and setup scripts exposing a run_setup(), setup(), or main() function.
        import setup

        for fn_name in ("run_setup", "setup", "main"):
            fn = getattr(setup, fn_name, None)
            if callable(fn):
                fn()
                break

        if force_setup:
            print("Setup complete!")
            sys.exit(0)


# URL validation (Checks both syntax AND live status)
def check_url(url: str) -> bool:
    if not bool(validators.url(url)):
        return False

    try:
        response = requests.head(
            url,
            timeout=5,
            allow_redirects=True,
            headers={"User-Agent": "Mozilla/5.0"}
        )
        return response.status_code < 400

    except requests.RequestException:
        return False


def main() -> None:
    # Keep relative paths (like ./plan.json and .env) anchored next to the binary
    # even when the user double-clicks the executable from outside a terminal.
    if getattr(sys, "frozen", False):
        os.chdir(APP_DIR)

    ensure_setup()
    load_local_env(ENV_FILE)

    # Support passing the URL as a CLI argument or via interactive prompt
    cli_args = [arg for arg in sys.argv[1:] if not arg.startswith("-")]
    hackathon_url = cli_args[0] if cli_args else input("Enter Devpost Hackathon URL: ").strip()

    # Start HAG
    if check_url(hackathon_url):
        print("URL is valid and live! Starting HAG...")

        try:
            # Scrape hackathon
            hackathon = scrape_hackathon(hackathon_url)

            # Save scraped hackathon data
            save_hackathon(hackathon)

            # Analyse hackathon and generate plan.json
            run_analyser(hackathon)

            # Give plan.json to OpenCode
            run_coder("./plan.json")

            print("HAG finished successfully!")

        except Exception as e:
            print(f"HAG failed: {e}")
    else:
        print("Invalid URL. Please enter a valid, active hackathon URL.")


if __name__ == "__main__":
    try:
        main()
    finally:
        # Prevent the console window from closing immediately on double-click
        if getattr(sys, "frozen", False):
            input("\nPress Enter to exit...")
