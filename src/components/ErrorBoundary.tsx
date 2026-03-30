import { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('DataWeave Studio crashed:', error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="h-screen w-screen bg-[#121212] flex items-center justify-center p-8">
          <div className="max-w-lg w-full bg-[#1a1a2e] border border-red-800/50 rounded-xl p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-red-500/20 flex items-center justify-center shrink-0">
                <svg width="20" height="20" viewBox="0 0 16 16" fill="#f87171">
                  <path d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14zm0-9.5a.75.75 0 0 0-.75.75v3.5a.75.75 0 0 0 1.5 0v-3.5A.75.75 0 0 0 8 5.5zM8 12a1 1 0 1 0 0-2 1 1 0 0 0 0 2z"/>
                </svg>
              </div>
              <div>
                <h2 className="text-lg font-semibold text-gray-100">Something went wrong</h2>
                <p className="text-sm text-gray-400">DataWeave Studio encountered an unexpected error.</p>
              </div>
            </div>

            <pre className="bg-[#0d0d0d] border border-gray-800 rounded p-3 text-xs text-red-300 font-mono overflow-auto max-h-40">
              {this.state.error?.message || 'Unknown error'}
            </pre>

            <button
              onClick={() => window.location.reload()}
              className="w-full bg-[#00a0df] hover:bg-[#0090c5] text-white py-2 rounded text-sm font-medium transition-colors cursor-pointer"
            >
              Reload Application
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
