# Hack-A-Gent - HAG
---

## What is HAG?
HAG is a CLI-based tool that uses AI to make a baseline project for hackathon from devpost(atleast as of now) so that hackers can inovate more not spend more time doing manual work. The motive of HAG is to boost productivity and innovation not make hackers lazy. Submitting the raw HAG produced project will just you a participating certificate not a prize.

### Tech Stack
HAG is a simple script written in python, using external libraries such as BeautifulSoup for scrapping the devpost hackathon information. For the analyser and planner agent I have used gpt_researcher with NVIDIA API(its free) and Tavily for web research. And finally for the coding agent I have used gemini-cli.

## My problems
I had started my making every agent from scratch, from scrapper to the coding agent, but after spend over 160 hours, I realised that building everything myself wasn't practical. I decided to use existing libraries and simplify the architecture by removing unnecessary agents, such as the judge agent. This helped me focus on the core workflow and make HAG more manageable.

## Prerequisites
- Python 3.9 or above
- npm
- A NVIDIA API key
- A Tavily API key
- gemini-cli configured

## Installation
First, clone the repository:
`git clone https://github.com/Theuser1211/Hack-A-Gent`

Navigate into the project directory:
`cd Hack-A-Gent`

Run the setup script:
`python setup.py`
The setup script will install the required Python packages, configure the API keys, and install and verify the Gemini CLI.

## Running HAG
Once setup is complete, run:
`python main.py`

HAG will ask for a Devpost hackathon URL:
`Enter Devpost Hackathon URL:`
Enter the URL of the hackathon you want to use.

HAG will then:
1. Validate the hackathon URL.
2. Scrape the hackathon information.
3. Research the hackathon requirements.
4. Generate a project idea.
5. Create an implementation plan.
6. Save the plan to plan.json.
7. Create a project workspace under projects/.
8. Launch Gemini CLI to build the project.

Generated projects will be stored in:
`projects/
└── <project-name>/`

## Dependencies
- Python — Required to run HAG.
- GPT Researcher — Used for hackathon research and project planning.
- BeautifulSoup — Used to scrape hackathon pages.
- Requests — Used for HTTP requests and URL validation.
- Tavily — Used by GPT Researcher for web research.
- Gemini CLI — Used as the coding agent that builds the generated project.
- NVIDIA API — Provides the LLM used by the research and planning pipeline.

# If you read so far, thanks for your patience I hope you like HAG.
### Made with love by Aarav
