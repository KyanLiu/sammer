export const USAGE = `
  sammer chat                    talk to it; it reads and stores as needed
  sammer ingest <files...>       fold documents into the wiki
  sammer tell <text...>          fold one piece of text in
  sammer ask <question...>       answer from the wiki, changing nothing
  sammer search <query...>       keyword search
  sammer pages                   list every page
  sammer user add <email>        create an account (prompts for password)

Options
  --read-only                    chat/ask: refuse anything that would write
  --max-steps=N                  tool-calling rounds per run (ingest: 16)
  --dry-run                      ingest: list what would be sent, send nothing
  --role=guest|friend|admin      user add: the account's role
  -h, --help

Environment (from .env in the working directory, or the shell, which wins)
  LLM_API_KEY     required
  LLM_PROVIDER    openai | anthropic     (default openai)
  LLM_BASE_URL, LLM_CHAT_MODEL           (provider defaults apply)
  DATA_DIR        vault location         (default ./data)`;
