import { Component, ErrorInfo, ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Unhandled error in app tree:", error, info.componentStack);
  }

  handleReload = () => {
    this.setState({ hasError: false });
    window.location.href = "/home";
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-6 text-center">
          <span className="text-4xl">😕</span>
          <h1 className="text-xl font-bold text-foreground">Something went wrong</h1>
          <p className="text-sm text-muted-foreground max-w-sm">
            This page hit an unexpected error. You can try going back to the home screen.
          </p>
          <button
            onClick={this.handleReload}
            className="px-6 py-3 rounded-xl gradient-primary text-primary-foreground font-semibold text-sm shadow-glow"
          >
            Back to Home
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
