import React, { forwardRef, useImperativeHandle, useRef, useEffect } from 'react';
import { GLView } from 'expo-gl';
import { Avatar3DController } from './Avatar3DController';

// Native counterpart to the web `<div ref={avatar3dContainerRef}>` +
// `new Avatar3DController(container)` pattern in MansakhaCallModal.js - a
// DOM container element doesn't exist on native, so GLView's own
// onContextCreate callback is the equivalent mount point, providing the
// ExpoWebGLRenderingContext Avatar3DController needs instead.
//
// Exposes the exact same imperative surface as a real Avatar3DController
// instance (loadModel/setEmotion/updateLipSync/render/isDisposed/dispose),
// via a forwarded ref, so MansakhaCallModal's existing
// `avatarControllerRef.current.xxx()` call sites work against this
// unchanged on native - the only difference is WHEN the real controller
// exists: GLView's context creation is asynchronous (a real native GL
// context takes a moment to initialize), so a loadModel() call arriving
// before that finishes is queued and replayed once the controller is ready,
// rather than lost.
const AvatarGLView = forwardRef(function AvatarGLView({ style }, ref) {
  const controllerRef = useRef(null);
  const pendingModelUrlRef = useRef(null);

  const handleContextCreate = async (gl) => {
    const controller = new Avatar3DController(gl);
    controllerRef.current = controller;
    if (pendingModelUrlRef.current) {
      const url = pendingModelUrlRef.current;
      pendingModelUrlRef.current = null;
      controller.loadModel(url).catch((err) => console.warn('Could not load 3D GLB model:', err));
    }
  };

  useImperativeHandle(ref, () => ({
    loadModel: (url) => {
      if (controllerRef.current) return controllerRef.current.loadModel(url);
      pendingModelUrlRef.current = url;
      return Promise.resolve();
    },
    setEmotion: (emotion) => controllerRef.current?.setEmotion(emotion),
    updateLipSync: (features) => controllerRef.current?.updateLipSync(features),
    render: () => controllerRef.current?.render(),
    get isDisposed() {
      return controllerRef.current ? controllerRef.current.isDisposed : false;
    },
    dispose: () => {
      if (controllerRef.current) {
        controllerRef.current.dispose();
        controllerRef.current = null;
      }
      pendingModelUrlRef.current = null;
    },
  }), []);

  useEffect(() => () => {
    if (controllerRef.current) {
      controllerRef.current.dispose();
      controllerRef.current = null;
    }
  }, []);

  return <GLView style={style} onContextCreate={handleContextCreate} />;
});

export default AvatarGLView;
