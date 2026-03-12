'use client';

import { GameProvider, useGame } from '@/ui/context/GameContext';
import { CreateScreen } from '@/ui/components/CreateScreen';
import { UnifiedGameLayout } from '@/ui/components/UnifiedGameLayout';

function GameRoot() {
  const { screen } = useGame();
  return (
    <div className="h-dvh min-h-screen flex flex-col bg-[#1e2128] overflow-hidden pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
      <div className="wp-shell flex-1 min-h-0 flex flex-col">
        {screen === 'create' && <CreateScreen />}
        {screen === 'game' && <UnifiedGameLayout />}
      </div>
    </div>
  );
}

export default function Home() {
  return (
    <GameProvider>
      <GameRoot />
    </GameProvider>
  );
}
