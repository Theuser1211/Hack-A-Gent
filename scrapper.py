# imports - always on top......
import json
import re
import requests
from bs4 import BeautifulSoup


def scrape_hackathon(url: str) -> dict:
    headers = {
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/140.0 Safari/537.36"
        )
    }

    response = requests.get(
        url,
        headers=headers,
        timeout=30,
    )

    response.raise_for_status()

    soup = BeautifulSoup(response.text, "html.parser")

    # --------------------------------------------------------
    # Title
    # --------------------------------------------------------

    title = None

    h1 = soup.find("h1")

    if h1:
        title = h1.get_text(" ", strip=True)

    if not title and soup.title:
        title = soup.title.get_text(" ", strip=True)

    # --------------------------------------------------------
    # Description
    # --------------------------------------------------------

    description = None

    meta_description = soup.find(
        "meta",
        attrs={"name": "description"},
    )

    if meta_description:
        description = meta_description.get("content")

    if not description:
        og_description = soup.find(
            "meta",
            attrs={"property": "og:description"},
        )

        if og_description:
            description = og_description.get("content")

    # --------------------------------------------------------
    # OpenGraph image
    # --------------------------------------------------------

    image = None

    og_image = soup.find(
        "meta",
        attrs={"property": "og:image"},
    )

    if og_image:
        image = og_image.get("content")

    # --------------------------------------------------------
    # Page text
    # --------------------------------------------------------

    for element in soup([
        "script",
        "style",
        "noscript",
    ]):
        element.decompose()

    text = soup.get_text("\n", strip=True)

    # Remove excessive blank lines
    text = re.sub(r"\n{3,}", "\n\n", text)

    # --------------------------------------------------------
    # Extract sections
    # --------------------------------------------------------

    sections = {}

    headings = soup.find_all(
        ["h1", "h2", "h3", "h4"]
    )

    for heading in headings:

        heading_text = heading.get_text(
            " ",
            strip=True,
        )

        if not heading_text:
            continue

        content = []

        current = heading.find_next_sibling()

        while current:

            if current.name in [
                "h1",
                "h2",
                "h3",
                "h4",
            ]:
                break

            if current.name in [
                "p",
                "li",
                "div",
            ]:
                value = current.get_text(
                    " ",
                    strip=True,
                )

                if value:
                    content.append(value)

            current = current.find_next_sibling()

        if content:
            sections[heading_text] = "\n".join(content)

    # --------------------------------------------------------
    # Return structured result
    # --------------------------------------------------------

    return {
        "url": url,
        "title": title,
        "description": description,
        "image": image,
        "sections": sections,
        "raw_text": text,
    }


def save_hackathon(data: dict, filename: str = "hackathon.json"):
    with open(
        filename,
        "w",
        encoding="utf-8",
    ) as file:
        json.dump(
            data,
            file,
            indent=2,
            ensure_ascii=False,
        )