import { Composition } from 'remotion'
import { DEMO_FRAMES, Demo } from './Demo.jsx'
import { DURATION, Promo } from './Promo.jsx'

export function RemotionRoot() {
  return (
    <>
      <Composition id="AlpineDemo" component={Demo} durationInFrames={DEMO_FRAMES} fps={30} width={1920} height={1080} />
      <Composition id="AlpinePromo" component={Promo} durationInFrames={DURATION} fps={30} width={1920} height={1080} />
    </>
  )
}
