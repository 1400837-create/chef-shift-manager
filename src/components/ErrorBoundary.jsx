import { Component } from 'react'
import { AlertTriangle, RotateCcw } from 'lucide-react'

// Catches render-time errors anywhere below it so a bug in one screen can't
// take down the whole app with a blank white page during service — this is
// the only tool on the line, so "reload and try again" needs to actually be
// reachable. Data itself is untouched (it's all in localStorage, written on
// every change, not held only in the crashed render tree), which is worth
// saying explicitly since a crash screen otherwise reads as "everything's gone".
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error, info) {
    console.error('LA CHEF crashed:', error, info)
  }

  render() {
    if (!this.state.hasError) return this.props.children
    return (
      <div className="min-h-screen bg-slate-100 dark:bg-slate-950 flex items-center justify-center px-6">
        <div className="max-w-sm w-full bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm p-6 text-center">
          <div className="w-14 h-14 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center mx-auto mb-3">
            <AlertTriangle size={26} className="text-red-600 dark:text-red-400" />
          </div>
          <h1 className="font-bold text-slate-800 dark:text-slate-100 text-lg mb-1.5">Что-то сломалось</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-5">
            Данные не потеряны — они сохранены на этом устройстве отдельно от экрана.
            Попробуйте перезагрузить страницу.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="w-full flex items-center justify-center gap-2 min-h-[52px] px-4 rounded-xl font-semibold text-[15px] bg-orange-500 active:bg-orange-600 text-white"
          >
            <RotateCcw size={20} /> Перезагрузить
          </button>
        </div>
      </div>
    )
  }
}
