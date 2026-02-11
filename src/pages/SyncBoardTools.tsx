import {
  EnvelopeSimpleIcon,
  TwitterLogoIcon,
  TelegramLogoIcon,
  FilePdfIcon,
  ImageIcon,
  GlobeIcon,
  BuildingIcon,
  RobotIcon,
  SwapIcon,
  InfoIcon,
  CalendarCheckIcon,
  ClockIcon,
  DownloadIcon,
} from '@phosphor-icons/react';
import './SyncBoardTools.css';
import { SyncBoardLayout } from '../components/syncboard/SyncBoardLayout';

const allTools = [
  { name: 'web_fetch', description: 'Fetch data from URLs and APIs', icon: DownloadIcon },
  { name: 'send_email', description: 'Send emails via AgentMail', icon: EnvelopeSimpleIcon },
  { name: 'post_tweet', description: 'Post tweets to X/Twitter', icon: TwitterLogoIcon },
  { name: 'send_telegram_message', description: 'Send messages via Telegram bot', icon: TelegramLogoIcon },
  { name: 'generate_pdf', description: 'Generate PDF documents from content', icon: FilePdfIcon },
  { name: 'generate_image', description: 'Generate images using AI', icon: ImageIcon },
  { name: 'web_search_exa', description: 'Search the web using Exa', icon: GlobeIcon },
  { name: 'company_research_exa', description: 'Research companies using Exa', icon: BuildingIcon },
  { name: 'list_available_models', description: 'List available AI models', icon: InfoIcon },
  { name: 'switch_model', description: 'Switch to a different AI model', icon: SwapIcon },
  { name: 'get_current_model', description: 'Get currently active model', icon: RobotIcon },
  { name: 'schedule_task', description: 'Create scheduled recurring tasks', icon: CalendarCheckIcon },
  { name: 'get_current_date', description: 'Get current date and time', icon: ClockIcon },
];

export function SyncBoardTools() {
  return (
    <SyncBoardLayout title="Tools">
      <div className="syncboard-tools">
        <div className="tools-header">
          <h2>Agent Tools</h2>
          <p className="tools-description">
            All {allTools.length} tools available to the AI agent. Use them by asking naturally in chat.
          </p>
        </div>

        <div className="tools-list-container">
          {allTools.map((tool) => (
            <div key={tool.name} className="tool-item">
              <tool.icon size={20} />
              <div className="tool-info">
                <span className="tool-name">{tool.name}</span>
                <span className="tool-desc">{tool.description}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </SyncBoardLayout>
  );
}
