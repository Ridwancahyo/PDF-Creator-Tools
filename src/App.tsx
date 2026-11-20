import { useCallback, useState } from 'react';
import { AiBackgroundWorkspace } from './components/AiBackgroundWorkspace';
import { Footer } from './components/Footer';
import { Header } from './components/Header';
import { ToolCatalog } from './components/ToolCatalog';
import { ToolWorkspace } from './components/ToolWorkspace';
import { getToolById } from './data/tools';
import type { ToolCategory, ToolId } from './types/pdf';

export default function App() {
  const [activeToolId, setActiveToolId] = useState<ToolId | null>(null);
  const [activeCategory, setActiveCategory] = useState<ToolCategory>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const handleSelectHome = useCallback((category?: ToolCategory) => {
    setActiveToolId(null);
    if (category) {
      setActiveCategory(category);
      setSearchQuery('');
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const handleSelectTool = useCallback((toolId: ToolId) => {
    setActiveToolId(toolId);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const activeTool = activeToolId ? getToolById(activeToolId) : undefined;
  const isAiBgTool =
    activeTool?.id === 'ai-remove-bg' || activeTool?.id === 'ai-change-bg';

  return (
    <div className="min-h-screen flex flex-col bg-[#f8fafc] text-slate-900">
      <Header
        activeToolId={activeToolId}
        activeCategory={activeCategory}
        onSelectHome={handleSelectHome}
        onSelectTool={handleSelectTool}
      />

      <main className="flex-1">
        {activeTool ? (
          isAiBgTool ? (
            <AiBackgroundWorkspace tool={activeTool} onBack={() => handleSelectHome()} />
          ) : (
            <ToolWorkspace tool={activeTool} onBack={() => handleSelectHome()} />
          )
        ) : (
          <ToolCatalog
            activeCategory={activeCategory}
            searchQuery={searchQuery}
            onCategoryChange={setActiveCategory}
            onSearchChange={setSearchQuery}
            onSelectTool={handleSelectTool}
          />
        )}
      </main>

      <Footer
        onSelectTool={handleSelectTool}
        onSelectHome={() => handleSelectHome('all')}
      />
    </div>
  );
}
