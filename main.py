# main script for Hack-A-Gent

# Imports ofc
import requests
import validators

from scrapper import scrape_hackathon, save_hackathon
from analyser import run_analyser
from coder import run_coder


# URL input
hackathonURL = input("Enter Devpost Hackathon URL: ")


# URL validation (Checks both syntax AND live status)
def check_url(url: str) -> bool:
    if not bool(validators.url(url)):
        return False

    try:
        response = requests.head(
            url,
            timeout=5,
            allow_redirects=True
        )

        return response.status_code < 400

    except requests.RequestException:
        return False


# Start HAG
if check_url(hackathonURL):

    print("URL is valid and live! Starting HAG...")

    try:

        # Scrape hackathon
        hackathon = scrape_hackathon(hackathonURL)

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