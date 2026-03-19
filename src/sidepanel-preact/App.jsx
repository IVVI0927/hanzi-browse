import { useState } from 'preact/hooks';
import { useConfig } from './hooks/useConfig';
import { useChat } from './hooks/useChat';
import { Header } from './components/Header';
import { MessageList } from './components/MessageList';
import { InputArea } from './components/InputArea';
import { SettingsModal } from './components/SettingsModal';
import { PlanModal } from './components/PlanModal';
import { EmptyState } from './components/EmptyState';

export function App() {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [suggestedText, setSuggestedText] = useState('');
  const config = useConfig();
  const chat = useChat();

  if (config.isLoading) {
    return (
      <div class="loading-container">
        <div class="loading-spinner" />
      </div>
    );
  }

  // Real readiness check: if no models are available, show setup prompt.
  // Users who set up via CLI will have models already and skip this entirely.
  if (config.availableModels.length === 0) {
    return (
      <div class="app">
        <div class="empty-state">
          <div class="empty-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 6v6l4 2" />
            </svg>
          </div>
          <h2>Hanzi needs credentials</h2>
          <p>Run the setup command in your terminal, or add credentials in settings.</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'center', marginTop: '8px' }}>
            <code style={{ padding: '8px 14px', background: 'var(--surface-secondary)', borderRadius: '8px', fontSize: '13px' }}>npx hanzi-in-chrome setup</code>
            <button
              class="btn btn-secondary"
              onClick={() => setIsSettingsOpen(true)}
            >
              Open Settings
            </button>
          </div>
        </div>
        {isSettingsOpen && (
          <SettingsModal
            config={config}
            onClose={() => setIsSettingsOpen(false)}
          />
        )}
      </div>
    );
  }

  const hasMessages = chat.messages.length > 0;

  return (
    <div class="app">
      <Header
        currentModel={config.currentModel}
        availableModels={config.availableModels}
        currentModelIndex={config.currentModelIndex}
        onModelSelect={config.selectModel}
        onNewChat={chat.clearChat}
        onOpenSettings={() => setIsSettingsOpen(true)}
      />

      <div class="messages-container">
        {!hasMessages ? (
          <EmptyState onSelectExample={setSuggestedText} primaryMode={config.onboarding.primaryMode} />
        ) : (
          <MessageList
            messages={chat.messages}
            pendingStep={chat.pendingStep}
          />
        )}
      </div>

      <InputArea
        isRunning={chat.isRunning}
        attachedImages={chat.attachedImages}
        onSend={chat.sendMessage}
        onStop={chat.stopTask}
        onAddImage={chat.addImage}
        onRemoveImage={chat.removeImage}
        hasModels={config.availableModels.length > 0}
        suggestedText={suggestedText}
        onClearSuggestion={() => setSuggestedText('')}
        onOpenSettings={() => setIsSettingsOpen(true)}
      />

      {isSettingsOpen && (
        <SettingsModal
          config={config}
          onClose={() => setIsSettingsOpen(false)}
        />
      )}

      {chat.pendingPlan && (
        <PlanModal
          plan={chat.pendingPlan}
          onApprove={chat.approvePlan}
          onCancel={chat.cancelPlan}
        />
      )}
    </div>
  );
}
