'use client';

import { GameProvider, useGame } from '@/ui/context/GameContext';
import { CreateScreen } from '@/ui/components/CreateScreen';
import { UnifiedGameLayout } from '@/ui/components/UnifiedGameLayout';

function GameRoot() {
  const { screen } = useGame();
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-zinc-950 flex items-center justify-center p-4">
      {screen === 'create' && <CreateScreen />}
      {screen === 'game' && <UnifiedGameLayout />}
    </div>
  );
}

export default function NotFound() {
  return (
    <GameProvider>
      <GameRoot />
    </GameProvider>
  );
}
