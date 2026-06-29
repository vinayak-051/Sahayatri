import { Component, type ReactNode } from "react";

interface Props { children: ReactNode; }
interface State { hasError: boolean; }

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };
  static getDerivedStateFromError() { return { hasError: true }; }
  render() {
    if (this.state.hasError) return (
      <div className="min-h-screen gradient-sky flex flex-col items-center justify-center p-6 text-center">
        <h2 className="text-xl font-bold text-foreground">Something went wrong</h2>
        <p className="text-sm text-muted-foreground mt-2">Please go back and try again.</p>
        <button onClick={() => window.history.back()} className="mt-6 py-3 px-8 rounded-2xl bg-primary text-white font-bold">Go Back</button>
      </div>
    );
    return this.props.children;
  }
}
