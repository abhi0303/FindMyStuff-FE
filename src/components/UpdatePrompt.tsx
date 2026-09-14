import { useRegisterSW } from 'virtual:pwa-register/react';
import { Button } from './ui/Button';
import '@/layout/AppShell.css';

/** Service worker registered with `registerType: 'prompt'` — never reload under them. */
export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW();

  if (!needRefresh) return null;

  return (
    <div className="update-banner" role="status">
      <span className="grow">A new version of FindMyStuff is ready.</span>
      <Button size="sm" variant="ghost" onClick={() => setNeedRefresh(false)}>Later</Button>
      <Button size="sm" variant="primary" onClick={() => updateServiceWorker(true)}>Reload</Button>
    </div>
  );
}
