import { cmd } from "./cmd"
import { UI } from "../ui"
import { EOL } from "os"

const COMMAND_DATA = [
  {
    name: "run",
    description: "Run kilo with a message",
    usage: "kilo run [message..]",
    examples: [
      "kilo run 'create a new endpoint'",
      "kilo run --continue",
      "kilo run --session <id> 'add tests'",
      "kilo run -m kilo/gpt-4 'explain this code'",
    ],
    options: [
      { flag: "--continue, -c", description: "Continue the last session" },
      { flag: "--session, -s", description: "Session id to continue" },
      { flag: "--fork", description: "Fork the session before continuing" },
      { flag: "--share", description: "Share the session" },
      { flag: "--model, -m", description: "Model to use (provider/model)" },
      { flag: "--agent", description: "Agent to use" },
      { flag: "--format", description: "Output format (default or json)" },
      { flag: "--file, -f", description: "File(s) to attach to message" },
      { flag: "--title", description: "Title for the session" },
      { flag: "--attach", description: "Attach to a running server" },
      { flag: "--password, -p", description: "Basic auth password" },
      { flag: "--dir", description: "Directory to run in" },
      { flag: "--port", description: "Port for local server" },
      { flag: "--variant", description: "Model variant" },
      { flag: "--thinking", description: "Show thinking blocks" },
      { flag: "--auto", description: "Auto-approve all permissions" },
    ],
  },
  {
    name: "serve",
    description: "Start a headless kilo server",
    usage: "kilo serve",
    examples: ["kilo serve", "kilo serve --port 8080", "kilo serve --hostname localhost"],
    options: [
      { flag: "--port", description: "Server port" },
      { flag: "--hostname", description: "Server hostname" },
    ],
  },
  {
    name: "web",
    description: "Start kilo server and open web interface",
    usage: "kilo web",
    examples: ["kilo web", "kilo web --port 3000"],
    options: [
      { flag: "--port", description: "Server port" },
      { flag: "--hostname", description: "Server hostname" },
    ],
  },
  {
    name: "session",
    description: "Manage sessions",
    usage: "kilo session <command>",
    examples: [
      "kilo session list",
      "kilo session list --format json",
      "kilo session list --max-count 10",
      "kilo session delete <session-id>",
    ],
    options: [
      { flag: "--format", description: "Output format (table or json)" },
      { flag: "--max-count, -n", description: "Limit to N most recent sessions" },
      { flag: "--all, -a", description: "List sessions from all projects" },
      { flag: "--search, -s", description: "Filter sessions by title" },
    ],
  },
  {
    name: "agent",
    description: "Manage agents",
    usage: "kilo agent <command>",
    examples: [
      "kilo agent create",
      "kilo agent list",
      "kilo agent create --path .kilo/agent --description 'Code reviewer'",
    ],
    options: [
      { flag: "--path", description: "Directory path to generate the agent file" },
      { flag: "--description", description: "What the agent should do" },
      { flag: "--mode", description: "Agent mode (all, primary, subagent)" },
      { flag: "--tools", description: "Comma-separated list of tools to enable" },
      { flag: "--model, -m", description: "Model to use (provider/model)" },
    ],
  },
  {
    name: "config",
    description: "Configuration tools",
    usage: "kilo config <command>",
    examples: ["kilo config check"],
    options: [],
  },
  {
    name: "auth, providers",
    description: "Manage AI providers and credentials",
    usage: "kilo auth <command>",
    examples: ["kilo auth list", "kilo auth login", "kilo auth login --provider openai", "kilo auth logout"],
    options: [
      { flag: "--provider, -p", description: "Provider id or name to log in to" },
      { flag: "--method, -m", description: "Login method label" },
    ],
  },
  {
    name: "models",
    description: "List all available models",
    usage: "kilo models [provider]",
    examples: ["kilo models", "kilo models openai", "kilo models --verbose", "kilo models --refresh"],
    options: [
      { flag: "--verbose", description: "Include metadata like costs" },
      { flag: "--refresh", description: "Refresh models cache from models.dev" },
    ],
  },
  {
    name: "mcp",
    description: "Manage MCP (Model Context Protocol) servers",
    usage: "kilo mcp <command>",
    examples: [
      "kilo mcp list",
      "kilo mcp add",
      "kilo mcp auth <name>",
      "kilo mcp logout <name>",
      "kilo mcp debug <name>",
    ],
    options: [],
  },
  {
    name: "plugin, plug",
    description: "Install plugin and update config",
    usage: "kilo plugin <module>",
    examples: [
      "kilo plugin @kilocode/theme-dracula",
      "kilo plugin --global @kilocode/theme-dracula",
      "kilo plugin --force @kilocode/theme-dracula",
    ],
    options: [
      { flag: "--global, -g", description: "Install in global config" },
      { flag: "--force, -f", description: "Replace existing plugin version" },
    ],
  },
  {
    name: "pr",
    description: "Fetch and checkout a GitHub PR branch",
    usage: "kilo pr <number>",
    examples: ["kilo pr 123", "kilo pr 456"],
    options: [],
  },
  {
    name: "export",
    description: "Export session data as JSON",
    usage: "kilo export [sessionID]",
    examples: ["kilo export", "kilo export <session-id>"],
    options: [],
  },
  {
    name: "import",
    description: "Import session data from JSON file or URL",
    usage: "kilo import <file>",
    examples: ["kilo import session.json", "kilo import https://app.kilo.ai/s/abc123"],
    options: [],
  },
  {
    name: "stats",
    description: "Show token usage and cost statistics",
    usage: "kilo stats",
    examples: ["kilo stats", "kilo stats --days 30", "kilo stats --models 10", "kilo stats --tools 20"],
    options: [
      { flag: "--days", description: "Show stats for last N days" },
      { flag: "--tools", description: "Number of tools to show" },
      { flag: "--models", description: "Show model statistics" },
      { flag: "--project", description: "Filter by project" },
    ],
  },
  {
    name: "upgrade",
    description: "Upgrade kilo to latest or a specific version",
    usage: "kilo upgrade [target]",
    examples: ["kilo upgrade", "kilo upgrade 0.1.48", "kilo upgrade --method npm"],
    options: [{ flag: "--method, -m", description: "Installation method" }],
  },
  {
    name: "uninstall",
    description: "Uninstall kilo and remove all related files",
    usage: "kilo uninstall",
    examples: ["kilo uninstall", "kilo uninstall --keep-config", "kilo uninstall --dry-run", "kilo uninstall --force"],
    options: [
      { flag: "--keep-config, -c", description: "Keep configuration files" },
      { flag: "--keep-data, -d", description: "Keep session data and snapshots" },
      { flag: "--dry-run", description: "Show what would be removed without removing" },
      { flag: "--force, -f", description: "Skip confirmation prompts" },
    ],
  },
  {
    name: "db",
    description: "Database tools",
    usage: "kilo db <command>",
    examples: ["kilo db", "kilo db 'SELECT * FROM sessions'", "kilo db path", "kilo db migrate"],
    options: [{ flag: "--format", description: "Output format (json or tsv)" }],
  },
  {
    name: "remote",
    description: "Enable remote connection for real-time session relay",
    usage: "kilo remote",
    examples: ["kilo remote"],
    options: [],
  },
  {
    name: "acp",
    description: "Start ACP (Agent Client Protocol) server",
    usage: "kilo acp",
    examples: ["kilo acp"],
    options: [{ flag: "--cwd", description: "Working directory" }],
  },
  {
    name: "debug",
    description: "Debug tools",
    usage: "kilo debug <command>",
    examples: ["kilo debug agent", "kilo debug config", "kilo debug file"],
    options: [],
  },
] as const

function renderCommandList() {
  const maxNameWidth = Math.max(...COMMAND_DATA.map((c) => c.name.length))
  const lines = COMMAND_DATA.map((cmd) => {
    const paddedName = cmd.name.padEnd(maxNameWidth)
    return `  ${UI.Style.TEXT_SUCCESS_BOLD}${paddedName}${UI.Style.TEXT_NORMAL}  ${cmd.description}`
  })
  return lines.join(EOL)
}

function renderCommandDetails(commandName: string) {
  const command = COMMAND_DATA.find((c) => c.name === commandName || c.name.startsWith(commandName))

  if (!command) {
    UI.error(`Unknown command: ${commandName}`)
    console.log()
    console.log(`  ${UI.Style.TEXT_DIM}Run 'kilo help' to see available commands.${UI.Style.TEXT_NORMAL}`)
    console.log()
    process.exit(1)
  }

  let output = ""
  output += `${UI.Style.TEXT_SUCCESS_BOLD}${command.name}${UI.Style.TEXT_NORMAL}: ${command.description}${EOL}${EOL}`
  output += `  ${UI.Style.TEXT_INFO_BOLD}Usage:${UI.Style.TEXT_NORMAL}${EOL}`
  output += `    ${command.usage}${EOL}${EOL}`

  if (command.examples.length > 0) {
    output += `  ${UI.Style.TEXT_INFO_BOLD}Examples:${UI.Style.TEXT_NORMAL}${EOL}`
    command.examples.forEach((ex) => {
      output += `    ${UI.Style.TEXT_DIM}${ex}${UI.Style.TEXT_NORMAL}${EOL}`
    })
    output += EOL
  }

  if (command.options.length > 0) {
    output += `  ${UI.Style.TEXT_INFO_BOLD}Options:${UI.Style.TEXT_NORMAL}${EOL}`
    const maxFlagWidth = Math.max(...command.options.map((o) => o.flag.length))
    command.options.forEach((opt) => {
      const paddedFlag = opt.flag.padEnd(maxFlagWidth)
      output += `    ${UI.Style.TEXT_DIM}${paddedFlag}${UI.Style.TEXT_NORMAL}  ${opt.description}${EOL}`
    })
    output += EOL
  }

  return output
}

export const HelpCommand = cmd({
  command: "help [command]",
  describe: "Show help information",
  builder: (yargs) => {
    return yargs.positional("command", {
      describe: "Command to show help for",
      type: "string",
    })
  },
  handler: async (args) => {
    console.log()
    console.log(UI.logo("  "))
    console.log()
    console.log(UI.Style.TEXT_HIGHLIGHT_BOLD + "kilo" + UI.Style.TEXT_NORMAL + " - AI-powered coding assistant")

    if (!args.command) {
      console.log()
      console.log(UI.Style.TEXT_INFO_BOLD + "Available Commands:" + UI.Style.TEXT_NORMAL)
      console.log("─".repeat(19))
      console.log(renderCommandList())
      console.log()
      console.log(
        `  ${UI.Style.TEXT_DIM}Use 'kilo help <command>' to show detailed help for a specific command.${UI.Style.TEXT_NORMAL}`,
      )
      console.log()
      console.log(`  ${UI.Style.TEXT_INFO}Documentation: https://kilo.ai/docs${UI.Style.TEXT_NORMAL}`)
      console.log()
      return
    }

    console.log()
    console.log(renderCommandDetails(args.command))
    console.log()
  },
})
