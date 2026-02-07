# Changelog

All notable changes to ClawSync are documented here.

## [Unreleased]

### Added

#### Documentation
- Created comprehensive `docs.html` with Mintlify-inspired design
- Sidebar navigation with section categories
- View as Markdown and Copy Markdown buttons
- Full setup guides for Convex, WorkOS, APIs, MCP, SyncBoard
- Step-by-step quickstart with numbered progress
- Environment variables reference tables
- Model providers comparison
- Skills system documentation
- Channel integration guides
- Production checklist

#### Landing Page
- Created public landing page at `/` with hero section, features grid, and call-to-action
- Added real-time public activity feed showing agent actions
- Added X/Twitter tweets display section for agents with X integration
- Added quickstart guide with command examples

#### X/Twitter Integration
- New `xTwitter.ts` backend with full X API v2 support
- Read tweets, reply to mentions, post tweets from agent
- OAuth 1.0a authentication for posting, Bearer Token for reading
- SyncBoard X configuration page (`/syncboard/x`)
- Toggle features: auto-reply, post from agent, show tweets on landing
- Tweet caching and management in SyncBoard
- New database tables: `xConfig`, `xTweets`

#### xAI (Grok) Model Support
- Added xAI as model provider in setup wizard
- Grok 3 and Grok 3 Fast model options
- Environment variable: `XAI_API_KEY`

#### SyncBoard Authentication
- Password-based authentication for SyncBoard admin
- Session tokens with expiration
- SHA-256 password hashing
- Login page with logo and flat design
- Logout functionality in sidebar

#### WorkOS AuthKit Preparation
- Created `auth.config.ts` placeholder for JWT validation
- Added provider setup comments in `main.tsx` and `App.tsx`
- `SyncBoardAuthGuard` component ready for WorkOS integration

#### Design System Updates
- Integrated Geist fonts from Vercel (via jsdelivr CDN)
- Removed all gradients for flat, modern UI
- Consistent use of design tokens from `tokens.css`
- Logo fallback pattern (SVG with PNG fallback)

#### Documentation
- Standalone `features.html` page for marketing
- Updated README with X integration section
- Updated README with xAI models section
- Added logo to README header
- Created FILES.md with file descriptions
- Created CHANGELOG.md
- Created TASK.md for progress tracking

#### ClawSync Challenge
- Added challenge section on features.html
- $500 prize for first 3 live demos posted on X
- Requirements: show at least 3 agent features
- Dark background with trophy icon

#### AgentMail Integration
- New `convex/agentMail.ts` backend with full API support
- Create, manage, and delete email inboxes
- Send and receive emails via AgentMail API
- Rate limiting per hour configurable in SyncBoard
- Auto-reply and forward-to-agent options
- Message logging and tracking
- New database tables: `agentMailConfig`, `agentMailInboxes`, `agentMailMessages`
- SyncBoard AgentMail page (`/syncboard/agentmail`)
- MCP integration for agent email tools

#### Icon System
- Replaced all emojis with Phosphor icons (@phosphor-icons/react)
- Updated LandingPage.tsx with Phosphor icons for features and activity
- Updated SyncBoardLayout.tsx sidebar navigation with Phosphor icons
- Updated SyncBoard.tsx navigation with Phosphor icons
- Updated SyncBoardChannels.tsx with brand logos (Telegram, Discord, etc.)
- Updated SyncBoardActivity.tsx with Phosphor icons
- Updated ActivityFeed.tsx with Phosphor icons
- Updated SyncBoardSkillNew.tsx with Phosphor icons
- Updated SetupWizard.tsx with HandWaving and Check icons
- Updated features.html with inline SVG Phosphor icons

### Changed

- features.html logo increased from 36px to 54px
- features.html hero description text reduced from 1.25rem to 1rem
- features.html docs links now point to docs.html instead of GitHub README
- Removed all emojis from React components and static HTML
- Commented out Self-Hosted feature card on features.html
- Removed "No Vercel or Netlify required" messaging from README and docs
- Renamed docs.html "Self Hosting" section to "Deployment"
- Setup wizard now uses logo image instead of text
- Login page uses logo image instead of text
- SyncBoard sidebar includes logo and X navigation item
- All pages use flat backgrounds (no gradients)
- Favicon changed from ICO to PNG format

### Fixed

- Geist fonts now load correctly via jsdelivr CDN (not Google Fonts)
- Logo fallback to PNG when SVG fails to load

### Security

- SyncBoard routes protected by authentication guard
- Password hashes stored in environment variables
- Session tokens expire after configured duration
- X API credentials stored in Convex environment variables

---

## [0.1.0] - Initial Release

### Added

- Core AI agent with @convex-dev/agent
- Real-time chat with streaming responses
- Multi-model support (Claude, GPT, Gemini via OpenRouter)
- Skills system (template, webhook, code-based)
- MCP server integration
- SyncBoard admin dashboard
- Soul document customization
- Activity logging
- Thread management
- Rate limiting with @convex-dev/rate-limiter
- Action caching with @convex-dev/action-cache
- Convex Self Static Hosting support
