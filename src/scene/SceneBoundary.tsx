import { Component, type ReactNode } from 'react'

interface Props {
  onError: () => void
  children: ReactNode
}

/**
 * Anything that goes wrong in the 3D scene (the chunk failing to load, a render error
 * rethrown by R3F) hands over to the no-WebGL fallback instead of blanking the page.
 */
export class SceneBoundary extends Component<Props, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch() {
    this.props.onError()
  }

  render() {
    return this.state.failed ? null : this.props.children
  }
}
