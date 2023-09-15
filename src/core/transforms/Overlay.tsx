/* ---------------------------------------------------------------------------------------------
 * Copyright (c) Infiniscene, Inc. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * -------------------------------------------------------------------------------------------- */
import ReactDOM from 'react-dom'
import React, { useEffect } from 'react'
import { Compositor } from '../namespaces'
import APIKitAnimation from '../../compositor/html/html-animation'
import { APIKitAnimationTypes } from '../../animation/core/types'
import { getProject, getProjectRoom } from '../data'
import CoreContext from '../context'
import { InternalEventMap, trigger } from '../events'
import { hasPermission, Permission } from '../../helpers/permission'
import Iframe from './components/Iframe'

// BEGIN Custom 360 Video Player Imports
import * as THREE from 'three'
import Hls from 'hls.js'

let isUserInteracting = false,
      lon = 0, lat = 0,
      phi = 0, theta = 0,
      onPointerDownPointerX = 0,
      onPointerDownPointerY = 0,
      onPointerDownLon = 0,
      onPointerDownLat = 0;

const VIDEO_WIDTH = 1280;
const VIDEO_HEIGHT = 720;

const distance = 50;

interface ISourceMap {
  sourceType: string
  trigger: keyof InternalEventMap
}

const SourceTriggerMap = [
  {
    sourceType: 'Overlay',
    trigger: 'OverlayMetadataUpdate',
  },
  {
    sourceType: 'Background',
    trigger: 'BackgroundMetadataUpdate',
  },
] as ISourceMap[]
// END Custom 360 Video Player Imports

export type OverlayProps = {
  src?: string
  // Opaque to the SDK
  [prop: string]: any
}

export type OverlaySource = {
  id: string
  sourceProps: OverlayProps
  sourceType: string
}

export const Overlay = {
  name: 'LS-Overlay',
  sourceType: 'Overlay',
  create(
    { onUpdate, onRemove },
    { sourceProps }: { sourceProps: OverlayProps },
  ) {
    onRemove(() => {
      clearInterval(interval)
    })

    const root = document.createElement('div')
    // BEGIN Custom 360 Video Player
    const room = getProjectRoom(CoreContext.state.activeProjectId)
    // END Custom 360 Video Player
    const role = getProject(CoreContext.state.activeProjectId).role
    let interval: NodeJS.Timer

    const IFrame = ({
      source,
      setStartAnimation,
    }: {
      source: OverlaySource
      setStartAnimation: (value: boolean) => void
    }) => {
      const { src, meta, height, width } = source?.sourceProps || {}
      const iframeRef = React.useRef<HTMLIFrameElement>(null)

      useEffect(() => {
        if (iframeRef.current) {
          iframeRef.current.style.removeProperty('transformOrigin')
          iframeRef.current.style.removeProperty('transform')
        }
      }, [src])

      const resizeIframe = () => {
        if (iframeRef.current) {
          const project = getProject(CoreContext.state.activeProjectId)
          const root = project.compositor.getRoot()
          const { x: rootWidth, y: rootHeight } = root.props.size
          let iframeWidth = iframeRef.current.clientWidth
          let iframeHeight = iframeRef.current.clientHeight

          let scale

          if (iframeWidth && iframeHeight) {
            scale = Math.min(rootWidth / iframeWidth, rootHeight / iframeHeight)
          } else {
            // It's possible the container will have no size defined (width/height=0)
            scale = 1
          }

          iframeRef.current.style.willChange = `transform`
          // @ts-ignore
          iframeRef.current.style.transformOrigin = '0 0'
          iframeRef.current.style.transform = `scale(${scale}) translateZ(0)`
          setStartAnimation(true)
        }
      }

      return (
        <React.Fragment>
          <Iframe
            key={source.id}
            url={src}
            frameBorder={0}
            iframeRef={iframeRef}
            height={height}
            width={width}
            onLoad={resizeIframe}
            styles={{ ...meta?.style }}
          />
        </React.Fragment>
      )
    }

    const Video = ({
      source,
      setStartAnimation,
    }: {
      source: OverlaySource
      setStartAnimation: (value: boolean) => void
    }) => {

      // BEGIN Custom 360 Video Player
      const Play = () => {
        if (videoRef?.current?.currentTime) {
          room.sendData({type: "VideoPlay"});
          videoRef.current!.play();
        }
      }

      const Pause = () => {
        if (videoRef?.current?.currentTime) {
          room.sendData({type: "VideoPause"});
          videoRef.current!.pause();
        }
      }
      // END Custom 360 Video Player

      const { src, type, meta, loop } = source?.sourceProps || {}
      const { id, sourceType } = source || {}
      const [refId, setRefId] = React.useState(null)
      const videoRef = React.useRef<HTMLVideoElement>(null)
      //console.log('Updated current time', videoRef?.current?.currentTime)

      // BEGIN Custom 360 Video Player
      const [progress, setProgress] = React.useState(0)
      const handleProgressEvent = () => {
        if (videoRef?.current?.currentTime) {
          const percent = videoRef.current.currentTime / videoRef.current.duration
          setProgress(percent * 100)
        }
      }
      // END Custom 360 Video Player

      /* A callback function that is called when the video element is created. */
      const handleRect = React.useCallback((node: HTMLVideoElement) => {
        videoRef.current = node
        setRefId(node ? node.id : null)
      }, [])

      /* A callback function that is called when the video element is loaded. */
      const onLoadedData = React.useCallback(() => {
        if (videoRef?.current) {
          videoRef.current!.play().catch(() => {
            videoRef.current.muted = true
            videoRef.current?.play()
          })
        }
      }, [src])

      /* A callback function that is called when the video playback ended. */
      const onEnded = React.useCallback(() => {
        if (interval) {
          clearInterval(interval)
        }
        if (hasPermission(role, Permission.UpdateProject)) {
          trigger('VideoEnded', { id: id, category: type })
        }
      }, [src])

      /* Checking if the video is playing and if the user has permission to manage self and if the guest is
      the same as the room participant id. If all of these are true, then it sets the current time of the
      video to the meta time. */
      React.useEffect(() => {
        if (meta && videoRef?.current && refId) {
          if (hasPermission(role, Permission.ManageSelf)) {
            if (meta?.time) {
              videoRef.current.currentTime = Number(meta?.time)
            }
          }
        }
      }, [meta?.time, refId])

      /* This is a React hook that is called when the component is unmounted. It clears the interval. */
      React.useEffect(() => {
        return () => {
          if (interval) {
            clearInterval(interval)
          }
        }
      }, [id])

      /* This is a React hook that is called when the component is mounted and when the refId changes. */
      React.useEffect(() => {
        if (!refId) {
          if (interval) {
            clearInterval(interval)
          }
        } else {
          if (videoRef.current) {
            // BEGIN Custom 360 Video Player
            if(src.includes('m3u8')) {
              if(videoRef.current.canPlayType('application/vnd.apple.mpegurl')) {
                videoRef.current!.src = src
              } else if (Hls.isSupported()) {
                var hls = new Hls({
                  enableWorker: false,
                })
                hls.loadSource(src)
                hls.attachMedia(videoRef.current)
              }
            } else {
              videoRef.current!.src = src
            }
            // END Custom 360 Video Player

            // BEGIN Custom 360 Video Player
            videoRef.current!.crossOrigin = "anonymous"
            videoRef.current!.hidden = true
            videoRef.current!.muted = true
            videoRef.current!.style.zIndex = "-1"

            var renderer = new THREE.WebGLRenderer({ alpha: true });
            renderer.setPixelRatio(window.devicePixelRatio);
            renderer.setSize(VIDEO_WIDTH, VIDEO_HEIGHT);
            videoRef.current!.parentElement.appendChild(renderer.domElement);

            var scene = new THREE.Scene();
            var camera = new THREE.PerspectiveCamera(75, VIDEO_WIDTH / VIDEO_HEIGHT, 0.1, 2000);
            renderer.render(scene, camera);

            var texture = new THREE.VideoTexture(videoRef.current, THREE.EquirectangularReflectionMapping);

            const sphere = new THREE.SphereGeometry(1000, 64, 40);
            sphere.scale(-1, 1, 1);
            const videoSphere = new THREE.Mesh(
              sphere,
              new THREE.MeshBasicMaterial({color: new THREE.Color(0xFFFFFF), map: texture})
            );
            scene.add(videoSphere);

            document.addEventListener( 'pointerdown', onPointerDown );
            document.addEventListener( 'pointermove', onPointerMove );
            document.addEventListener( 'pointerup', onPointerUp );
            videoRef.current!.addEventListener( 'timeupdate', handleProgressEvent );

            animate();

            function onPointerDown(event: MouseEvent) {

              isUserInteracting = true;

              onPointerDownPointerX = event.clientX;
              onPointerDownPointerY = event.clientY;

              onPointerDownLon = lon;
              onPointerDownLat = lat;

            }

            function onPointerMove( event : MouseEvent ) {

              if ( isUserInteracting === true ) {

                lon = ( onPointerDownPointerX - event.clientX ) * 0.1 + onPointerDownLon;
                lat = ( onPointerDownPointerY - event.clientY ) * 0.1 + onPointerDownLat;

              }

            }

            function onPointerUp() {

              isUserInteracting = false;

            }

            function animate() {
              requestAnimationFrame(animate);
              update();
            }

            function update() {

              lat = Math.max( - 85, Math.min( 85, lat ) );
              phi = THREE.MathUtils.degToRad( 90 - lat );
              theta = THREE.MathUtils.degToRad( lon );

              camera.position.x = distance * Math.sin( phi ) * Math.cos( theta );
              camera.position.y = distance * Math.cos( phi );
              camera.position.z = distance * Math.sin( phi ) * Math.sin( theta );

              camera.lookAt( 0, 0, 0 );

              renderer.render( scene, camera );

            }

            if (loop) {
              videoRef.current.loop = Boolean(loop)
            }
            // END Custom 360 Video Player
            videoRef.current!.play().catch(() => {
              videoRef.current.muted = true
              videoRef.current.play()
            })
            if (hasPermission(role, Permission.UpdateProject)) {
              interval = setInterval(() => {
                if (videoRef.current.duration) {
                  const timePending =
                    videoRef.current.duration - videoRef.current.currentTime
                  console.log('sendData',{type: "UpdateVideoTime", id: 'HOST', time: Math.floor(videoRef?.current?.currentTime) || 0})
                  room?.sendData({type: "UpdateVideoTime", id: 'HOST', time: Math.floor(videoRef?.current?.currentTime) || 0})
                  trigger('VideoTimeUpdate', {
                    category: sourceType,
                    id: id,
                    time: Math.floor(timePending),
                  })
                }
              }, 3000)
            }

            // BEGIN Custom 360 Video Player
            return room?.onData((event, senderId) => {
              // Handle request for time sync.
              if (videoRef?.current?.currentTime) {
                /* This is checking if the user has permission to manage guests. If they do, then it triggers an
                    internal event. */
                if (
                  event.type === 'UserJoined' &&
                  hasPermission(role, Permission.ManageGuests)
                ) {
                  console.log('event: UserJoined', videoRef?.current?.currentTime)
                  room?.sendData({type: "UpdateVideoTime", id: senderId, time: Math.floor(videoRef?.current?.currentTime) || 0})
                } else if (event.type === 'VideoPause'
                ) {
                  videoRef.current!.pause()
                } else if (event.type === 'VideoPlay'
                ) {
                  videoRef.current!.play()
                }
              }
            })
            // END Custom 360 Video Player
          }
        }
      }, [refId])

      // BEGIN Custom 360 Video Player
      React.useEffect(() => {
        if (!refId) return;
        if (videoRef.current) {
          return room?.onData((event, senderId) => {
            console.log('event: UpdateVideoTime. event.time:', event.time, 'currentTime:', videoRef?.current?.currentTime)
            if (event.type === 'UpdateVideoTime' && !hasPermission(role, Permission.UpdateProject) && Math.abs(videoRef.current.currentTime - event.time) > 1.5) {
              console.log('UpdateVideoTime. Time sync difference is greater than 1.5 seconds')
              videoRef.current.currentTime = event.time
            }
          })
        }
      }, [refId])
      // END Custom 360 Video Player

      // Edited for Custom 360 Video Player
      return (
        <div style={{position: "relative", width: "100%", height: "100%"}}>
        <React.Fragment key={id}>
          {src && (
            <video
              id={id}
              ref={handleRect}
              style={{ ...sourceProps.meta.style, ...meta.style }}
              onLoadedData={onLoadedData}
              onEnded={onEnded}
              onCanPlay={() => setStartAnimation(true)}
            />
          )}
        </React.Fragment>

        { hasPermission(role, Permission.ManageGuests) && (
            <div id="360controls" style={{position: "absolute", display: "flex", flexDirection: "row", left: "12.5%", width: "75%", height: "100%", paddingBottom: "10px", backgroundColor: "transparent", pointerEvents: "auto", zIndex: 1000, alignItems: "end"}}>
              <button id="360playpause" onClick={Play} style={{display: "flex", padding: "0.5em", marginRight: "0.5em", backgroundColor: "white", color: "black", border: "none", borderRadius: "0.5em"}}>Play</button>
              <button id="360playpause" onClick={Pause} style={{ display: "flex", padding: "0.5em", backgroundColor: "white", color: "black", border: "none", borderRadius: "0.5em"}}>Pause.</button>
              <input type="range" min="0" max="100" value={progress} style={{display: "flex", width: "100%", margin: "0 0.5em", pointerEvents: "none", padding: "0.5em"}} className="slider" id="myRange" step="0.5"/>
            </div>
          )
          }
        </div>
      )
    }

    const Image = ({
      source,
      setStartAnimation,
    }: {
      source: OverlaySource
      setStartAnimation: (value: boolean) => void
    }) => {
      const { src, meta } = source?.sourceProps || {}
      const { id } = source || {}

      return (
        <React.Fragment key={id}>
          {src && (
            <img
              style={{ ...sourceProps.meta.style, ...meta.style }}
              src={src}
              onLoad={() => setStartAnimation(true)}
            />
          )}
        </React.Fragment>
      )
    }

    const Overlay = ({ source }: { source: OverlaySource }) => {
      const { type } = source?.sourceProps || {}
      const { id } = source || {}
      const [startAnimation, setStartAnimation] = React.useState(false)
      useEffect(() => {
        setStartAnimation(false)
      }, [id])

      return (
        <APIKitAnimation
          id={id}
          type="overlay"
          enter={APIKitAnimationTypes.FADE_IN}
          exit={APIKitAnimationTypes.FADE_OUT}
          duration={400}
        >
          <div
            style={{ opacity: startAnimation ? 1 : 0 }}
            className={`overlayContainer overlay-transition`}
          >
            {id && type === 'image' && (
              <Image source={source} setStartAnimation={setStartAnimation} />
            )}
            {id && type === 'video' && (
              <Video source={source} setStartAnimation={setStartAnimation} />
            )}
            {id && type === 'custom' && (
              <IFrame source={source} setStartAnimation={setStartAnimation} />
            )}
          </div>
        </APIKitAnimation>
      )
    }

    const render = (source: OverlaySource) =>
      ReactDOM.render(
        <>
          <Overlay source={source} />
        </>,
        root,
      )

    onUpdate((props) => {
      render({ ...props })
    })

    return {
      root,
    }
  },
} as Compositor.Transform.TransformDeclaration
