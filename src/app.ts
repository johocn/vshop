import { useLaunch } from '@tarojs/taro'
import type { PropsWithChildren } from 'react'
import './app.scss'

function App({ children }: PropsWithChildren) {
  useLaunch(() => {
    console.log('[bead-diy] app launched')
  })

  return children
}

export default App
