/* ---------------------------------------------------------------------------------------------
 * Copyright (c) Infiniscene, Inc. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * -------------------------------------------------------------------------------------------- */
import ReactDOM from 'react-dom'
import React from 'react'
import { CoreContext } from '../context'
import { getProject, getProjectRoom } from '../data'
import { Compositor } from '../namespaces'
import { InternalEventMap, trigger, triggerInternal } from '../events'
import APIKitAnimation from '../../compositor/html/html-animation'
import { APIKitAnimationTypes } from '../../animation/core/types'

// Custom 360 Video Player Imports
import * as THREE from 'three'
import Hls from 'hls.js'

let isUserInteracting = false,
      lon = 0, lat = 0,
      phi = 0, theta = 0,
      onPointerDownPointerX = 0,
      onPointerDownPointerY = 0,
      onPointerDownLon = 0,
      onPointerDownLat = 0;

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

export const Video2 = {
  name: 'LS-Video-2',
  sourceType: 'Video2',
  props: {
    id: {
      type: String,
      required: true,
    },
  },
  useSource(sources, props) {
    return sources.find((x) => x.props.type === props.id)
  },
  create(
    { onUpdate, onNewSource, onRemove },
    initialProps,
  ) {
    onRemove(() => {
      clearInterval(interval)
    })

    const root = document.createElement('div')
    const room = getProjectRoom(CoreContext.state.activeProjectId)
    const role = getProject(CoreContext.state.activeProjectId).role
   
    let source: any
    let interval: NodeJS.Timer

    const Video = ({ source }: { source: any }) => {

      const SourceTrigger = SourceTriggerMap.find(
        (x) => x.sourceType === initialProps.proxySource,
      )
      const { src, type, meta, loop } = source?.value || {}
      const { id } = source || {}
      const [refId, setRefId] = React.useState(null)
      const videoRef = React.useRef<HTMLVideoElement>(null)

      const onLoadedData = React.useCallback(() => {
        if (videoRef?.current) {
          videoRef.current!.play().catch(() => {
            videoRef.current.muted = true
            videoRef.current?.play()
          })
        }
      }, [src, videoRef])

      const onEnded = React.useCallback(() => {
        if (interval) {
          clearInterval(interval)
        }
        trigger('VideoEnded', { id: id, category: type })
      }, [src])

      React.useEffect(() => {
        if (meta) {
          if (room?.participantId !== meta?.owner && videoRef?.current) {
            videoRef.current.currentTime = meta?.time || 0
          }
        }
      }, [meta, videoRef])

      React.useEffect(() => {
        return room?.onData((event, senderId) => {
          // Handle request for time sync.
          if (videoRef?.current?.currentTime) {
            if (
              event.type === 'UserJoined' &&
              senderId !== room?.participantId
            ) {
              triggerInternal(SourceTrigger.trigger, {
                projectId: CoreContext.state.activeProjectId,
                role,
                sourceId: id,
                doTrigger: true,
                metadata: {
                  time: Math.floor(videoRef?.current?.currentTime) || 0,
                  owner: room?.participantId,
                },
              })
            }
          }
        })
      }, [videoRef])

      const handleRect = React.useCallback((node: HTMLVideoElement) => {
        videoRef.current = node
        setRefId(node ? node.id : null)
      }, [])

      React.useEffect(() => {
        return () => {
          if (interval) {
            clearInterval(interval)
          }
        }
      }, [id])

      React.useEffect(() => {
        if (!refId) {
          if (interval) {
            clearInterval(interval)
          }
        } else {
          if (videoRef.current) {
    
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
            
            videoRef.current!.crossOrigin = "anonymous"
            videoRef.current!.hidden = true
            
            var renderer = new THREE.WebGLRenderer({ alpha: true });
            renderer.setPixelRatio(window.devicePixelRatio);
            renderer.setSize(window.innerWidth, window.innerHeight);
            videoRef.current!.parentElement.appendChild(renderer.domElement);

            var scene = new THREE.Scene();
            var camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 2000);
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

            animate();

            // function readCookie(key: string) {
            //   var result;
            //   (result = new RegExp('(?:^|; )' + encodeURIComponent(key) + '=([^;]*)').exec(document.cookie)) ? (result[1]) : null;
            //   console.log('result : ' + result[1]);
            //   return {key: key, value: result[1]}
            // }

            // function setUpCookie() {
            //   var policy = readCookie('CloudFront-Policy')
            //   var sig = readCookie('CloudFront-Signature')
            //   var id = readCookie('CloudFront-Key-Pair-Id')

            //   return `${policy.key}=${policy.value};${sig.key}=${sig.value};${id.key}=${id.value}`
            // }

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
            videoRef.current!.play().catch(() => {
              videoRef.current.muted = true
              videoRef.current.play()
            })

            interval = setInterval(() => {
              if (videoRef.current.duration) {
                const timePending =
                  videoRef.current.duration - videoRef.current.currentTime
                trigger('VideoTimeUpdate', {
                  category: type,
                  id: id,
                  time: Math.floor(timePending),
                })
              }
            }, 1000)

            triggerInternal(SourceTrigger.trigger, {
              projectId: CoreContext.state.activeProjectId,
              role,
              sourceId: id,
              doTrigger: true,
              metadata: {
                time: Math.floor(videoRef?.current?.currentTime) || 0,
                owner: room?.participantId,
              },
            })
          }
        }
      }, [refId])

      return (
        <APIKitAnimation
          id={id}
          type="video"
          enter={APIKitAnimationTypes.FADE_IN}
          exit={APIKitAnimationTypes.FADE_OUT}
          duration={400}
        >
          {src && (
            <video
              id={id}
        
              ref={handleRect}
              style={initialProps.style}
              {...initialProps.props}
              onLoadedData={onLoadedData}
              onEnded={onEnded}
            />
          )}
        </APIKitAnimation>
      )
    }

    const render = () => ReactDOM.render(<Video source={source} />, root)

    onUpdate(() => {
      render()
    })

    onNewSource((_source) => {
      source = _source
      render()
    })

    return {
      root,
    }
  },
} as Compositor.Transform.TransformDeclaration
