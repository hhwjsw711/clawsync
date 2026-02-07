<p align="center">
  <img src="public/clawsync-logo.svg" alt="ClawSync" width="180" />
</p>

<h1 align="center">ClawSync</h1>

<p align="center">
  Open source AI agent platform built with React + Convex.<br>
  Deploy your personal AI agent with chat UI, skills system, MCP support, and multi-model routing.
</p>

<p align="center">
  <em>Inspired by <a href="https://openclaw.ai/">OpenClaw.ai</a></em>
</p>

## ClawSync Challenge

**Win $500 + Swag + API Credits**

Be one of the first three to deploy ClawSync and show it off. Post a live demo on X demonstrating at least three agent features.

**Prizes:** $500 cash/gift card, swag, API credits

**Requirements:**
- Post a live demo video on X showing your deployed ClawSync agent
- Demonstrate at least 3 different agent features (chat, skills, MCP, channels, X integration, etc.)
- SyncBoard admin dashboard and Live Activity Feed do not count as features
- Tag **@clawsync** and use **#ClawSyncChallenge**
- First 3 valid submissions win

## Features

- **Public Chat UI** - Clean, real-time chat with streaming responses
- **SyncBoard Admin** - Private dashboard to manage your agent
- **Skills System** - Template, webhook, or code-based skills
- **Multi-Model** - Claude, GPT, Grok, Gemini, or any OpenRouter model
- **MCP Support** - Connect to MCP servers or expose your agent as one
- **Channel Integrations** - Telegram, Discord, WhatsApp, Slack, Email
- **X (Twitter) Integration** - Read, reply, and post tweets from your agent
- **AgentMail** - Email inboxes for your agent with rate limits
- **Live Activity Feed** - Public real-time log of agent actions

## Quick Start

### Prerequisites

- Node.js 18+
- npm or pnpm
- A Convex account (free tier works)
- An Anthropic API key (or OpenAI/OpenRouter)

### Setup

1. **Clone and install:**

```bash
git clone https://github.com/waynesutton/clawsync.git
cd clawsync
npm install
```

2. **Initialize Convex:**

```bash
npx convex dev
```

This will prompt you to create a new Convex project. Follow the prompts.

3. **Set environment variables:**

In the Convex Dashboard (dashboard.convex.dev), go to Settings > Environment Variables and add:

```
ANTHROPIC_API_KEY=sk-ant-...
```

Optional for multi-model support:
```
OPENAI_API_KEY=sk-...
XAI_API_KEY=xai-...
OPENROUTER_API_KEY=sk-or-...
```

4. **Start the frontend:**

```bash
npm run dev
```

5. **Complete setup:**

Visit http://localhost:5173 and complete the setup wizard. This creates your agent configuration.

6. **Open in browser:**

- Landing Page: http://localhost:5173
- Chat: http://localhost:5173/chat
- SyncBoard: http://localhost:5173/syncboard

## Deployment

### Deploy to Production

```bash
# Deploy everything (backend + frontend)
npm run deploy

# Or deploy static files only
npm run deploy:static
```

Your app will be available at `https://your-project.convex.site`.

### Deployment Options

| Mode | Description | Best For |
|------|-------------|----------|
| Convex Storage | Files in Convex, served via HTTP | Simple apps, development |
| Convex + Cloudflare CDN | Files in Convex, cached at edge | Custom domains, production |

See [@convex-dev/self-static-hosting](https://github.com/get-convex/self-static-hosting) for advanced options.

## Authentication

### SyncBoard Password Protection

Protect your admin dashboard with a password:

1. Generate a password hash:
```bash
node -e "console.log(require('crypto').createHash('sha256').update('your-password').digest('hex'))"
```

2. Set `SYNCBOARD_PASSWORD_HASH` in Convex Dashboard > Settings > Environment Variables.

3. Restart your app. SyncBoard will now require login.

### WorkOS AuthKit (Coming Soon)

Enterprise SSO support via WorkOS AuthKit is planned. The codebase is prepared for this integration:

- `convex/auth.config.ts` - JWT validation configuration (placeholder)
- `src/main.tsx` - Comments for AuthKit provider setup
- `src/App.tsx` - SyncBoardAuthGuard ready for WorkOS

See [Convex AuthKit docs](https://docs.convex.dev/auth/authkit/) when ready to enable.

## X (Twitter) Integration

Connect your agent to X (Twitter) to read tweets, reply to mentions, and post updates.

### Setup

1. Create a project at [X Developer Portal](https://developer.x.com/en/portal/dashboard)
2. Get your API credentials (OAuth 1.0a for posting, Bearer Token for reading)
3. Set environment variables in Convex Dashboard:

```
X_BEARER_TOKEN=...          # For reading tweets
X_API_KEY=...               # OAuth 1.0a Consumer Key
X_API_SECRET=...            # OAuth 1.0a Consumer Secret
X_ACCESS_TOKEN=...          # OAuth 1.0a Access Token
X_ACCESS_TOKEN_SECRET=...   # OAuth 1.0a Access Token Secret
```

4. Enable in SyncBoard > X (Twitter)
5. Configure options:
   - **Show on Landing** - Display agent tweets on your landing page
   - **Auto-Reply** - Automatically reply to mentions
   - **Post from Agent** - Allow the agent to post tweets

### Features

- Read tweets and thread conversations
- Reply to mentions automatically
- Post tweets from the agent
- Display selected tweets on landing page
- Activity logging for all X interactions

## xAI (Grok) Models

ClawSync supports xAI's Grok models alongside Claude, GPT, and others.

### Setup

1. Get an API key from [xAI Console](https://console.x.ai/)
2. Set `XAI_API_KEY` in Convex Dashboard
3. Select Grok models in SyncBoard > Models or during setup

### Available Models

| Model | Description |
|-------|-------------|
| grok-3 | xAI flagship model |
| grok-3-fast | Fast variant for quicker responses |

## Project Structure

```
clawsync/
├── convex/                    # Convex backend
│   ├── agent/                 # Agent core
│   │   ├── clawsync.ts       # Agent definition
│   │   ├── security.ts       # Security checker
│   │   ├── toolLoader.ts     # Dynamic tool loading
│   │   └── modelRouter.ts    # Multi-model routing
│   ├── auth.config.ts         # WorkOS config (placeholder)
│   ├── xTwitter.ts            # X/Twitter integration
│   ├── staticHosting.ts       # Self-static-hosting API
│   ├── schema.ts              # Database schema
│   ├── convex.config.ts       # Component registration
│   └── http.ts                # HTTP endpoints
├── src/                       # React frontend
│   ├── pages/
│   │   ├── LandingPage.tsx   # Public landing with tweets + activity
│   │   ├── ChatPage.tsx      # Chat UI
│   │   ├── SetupWizard.tsx   # First-run setup
│   │   ├── SyncBoardX.tsx    # X/Twitter config
│   │   ├── SyncBoard*.tsx    # Other admin pages
│   │   └── SyncBoardLogin.tsx # Password login
│   ├── components/
│   └── styles/
│       ├── tokens.css         # Design tokens (Geist fonts)
│       └── global.css
├── features.html              # Standalone features page
├── content/
│   └── soul.md                # Default soul document
├── AGENTS.md                  # For AI coding agents
└── CLAUDE.md                  # For Claude Code
```

## Design System

ClawSync uses a custom design system with Geist fonts from Vercel.

| Token | Value | Usage |
|-------|-------|-------|
| `--bg-primary` | #f3f3f3 | Page backgrounds |
| `--bg-secondary` | #ececec | Cards, inputs |
| `--interactive` | #ea5b26 | Buttons, links |
| `--text-primary` | #232323 | Body text |
| `--font-sans` | Geist | UI text |
| `--font-mono` | Geist Mono | Code |

All tokens are in `src/styles/tokens.css`. Never hardcode colors.

## Commands

```bash
npm install          # Install dependencies
npx convex dev       # Start Convex backend
npm run dev          # Start Vite frontend
npm run build        # Production build
npm run deploy       # Deploy to Convex
npm run lint         # ESLint
npm run typecheck    # TypeScript check
```

## Adding Skills

### Template Skill
1. SyncBoard > Skills > Add Skill
2. Select "Template Skill"
3. Choose a template and configure
4. Approve the skill

### Webhook Skill
1. SyncBoard > Skills > Add Skill
2. Select "Webhook Skill"
3. Enter the API endpoint URL
4. Add domain to allowlist
5. Approve the skill

### Code Skill
Add a file in `convex/agent/skills/` and register it in the skill registry.

## Security

See [CLAUDE.md](./CLAUDE.md) for security rules:

- Never store secrets in code
- Never modify `security.ts` without review
- All skills start unapproved
- Webhook handlers verify signatures
- No `.collect()` without `.take(n)`

## Contributing

1. Fork the repo
2. Create a feature branch
3. Make changes following CLAUDE.md guidelines
4. Submit a pull request

## License

MIT License. Fork it, own it.

---

Built with [Convex](https://convex.dev), [WorkOS](https://workos.com) (coming soon), [xAI](https://x.ai), and [Geist](https://vercel.com/font).
