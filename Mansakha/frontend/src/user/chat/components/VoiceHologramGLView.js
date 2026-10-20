import React, { forwardRef, useImperativeHandle, useRef, useEffect } from 'react';
import { GLView } from 'expo-gl';
import { VoiceHologramController } from './VoiceHologramController';

// Native counterpart to the web `<canvas>` hologram effect - same
// forwarded-imperative-handle pattern as AvatarGLView.js, but there's no
// model to load: the scene builds itself as soon as the GL context exists.
const VoiceHologramGLView = forwardRef(function VoiceHologramGLView({ style, speechState }, ref) {
  const controllerRef = useRef(null);

  const handleContextCreate = (gl) => {
    const controller = new VoiceHologramController(gl);
    controller.setSpeechState(speechState);
    controllerRef.current = controller;
  };

  useEffect(() => {
    controllerRef.current?.setSpeechState(speechState);
  }, [speechState]);

  useImperativeHandle(ref, () => ({
    render: () => controllerRef.current?.render(),
    get isDisposed() {
      return controllerRef.current ? controllerRef.current.isDisposed : false;
    },
    dispose: () => {
      if (controllerRef.current) {
        controllerRef.current.dispose();
        controllerRef.current = null;
      }
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

export default VoiceHologramGLView;
