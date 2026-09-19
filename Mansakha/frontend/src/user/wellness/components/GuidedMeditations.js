import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet, Animated, Easing } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import Exercise3DViewer from './Exercise3DViewer';

// A neutral mid-tone used for the head/skin parts of the human figures below,
// so they read as a person rather than a brand-colored blue shape.
const SKIN_TONE = '#C68863';
import { colors } from '../../shared/theme/colors';
import { spacing } from '../../shared/theme/spacing';
import { radius } from '../../shared/theme/radius';
import { typography } from '../../shared/theme/typography';
import { shadow } from '../../shared/theme/shadow';

// Five named, evidence-based techniques (ported from the Restora wellness
// library's animation set) replacing the single generic breathing circle
// this screen used to show under Meditation - each gets its own distinct
// visual so they read as different exercises, not the same animation reused.

function Ring478({ running }) {
  const scale = useRef(new Animated.Value(1)).current;
  const opacity = useRef(new Animated.Value(1)).current;
  const [phase, setPhase] = useState('Ready');

  useEffect(() => {
    if (!running) {
      scale.stopAnimation();
      opacity.stopAnimation();
      scale.setValue(1);
      opacity.setValue(1);
      setPhase('Ready');
      return undefined;
    }

    let cancelled = false;
    let holdTimeout = null;

    const runCycle = () => {
      if (cancelled) return;
      setPhase('Inhale');
      Animated.parallel([
        Animated.timing(scale, { toValue: 1.8, duration: 4000, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.35, duration: 4000, useNativeDriver: true }),
      ]).start(({ finished }) => {
        if (!finished || cancelled) return;
        setPhase('Hold');
        holdTimeout = setTimeout(() => {
          if (cancelled) return;
          setPhase('Exhale');
          Animated.parallel([
            Animated.timing(scale, { toValue: 1, duration: 8000, useNativeDriver: true }),
            Animated.timing(opacity, { toValue: 1, duration: 8000, useNativeDriver: true }),
          ]).start(({ finished: doneExhale }) => {
            if (doneExhale && !cancelled) runCycle();
          });
        }, 7000);
      });
    };
    runCycle();

    return () => {
      cancelled = true;
      if (holdTimeout) clearTimeout(holdTimeout);
      scale.stopAnimation();
      opacity.stopAnimation();
    };
  }, [running]);

  return (
    <View style={styles.visualWrap}>
      <View style={styles.ringOuter}>
        <Animated.View style={[styles.ringCore, { transform: [{ scale }], opacity }]} />
      </View>
      <Text style={styles.phaseText}>{phase}</Text>
    </View>
  );
}

const BOX_SIZE = 120;
const BOX_CORNERS = [
  { x: 0, y: 0 },
  { x: BOX_SIZE, y: 0 },
  { x: BOX_SIZE, y: BOX_SIZE },
  { x: 0, y: BOX_SIZE },
  { x: 0, y: 0 },
];
const BOX_PHASES = ['Inhale', 'Hold', 'Exhale', 'Hold'];

function BoxBreathing({ running }) {
  const pos = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const [phase, setPhase] = useState('Ready');

  useEffect(() => {
    if (!running) {
      pos.stopAnimation();
      pos.setValue({ x: 0, y: 0 });
      setPhase('Ready');
      return undefined;
    }

    let cancelled = false;

    const runLeg = (cornerIndex) => {
      if (cancelled) return;
      setPhase(BOX_PHASES[cornerIndex % 4]);
      Animated.timing(pos, {
        toValue: BOX_CORNERS[cornerIndex + 1],
        duration: 4000,
        easing: Easing.linear,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished && !cancelled) runLeg((cornerIndex + 1) % 4);
      });
    };
    runLeg(0);

    return () => {
      cancelled = true;
      pos.stopAnimation();
    };
  }, [running]);

  return (
    <View style={styles.visualWrap}>
      <View style={styles.boxTrack}>
        <Animated.View style={[styles.boxDot, { transform: pos.getTranslateTransform() }]} />
      </View>
      <Text style={styles.phaseText}>{phase}</Text>
    </View>
  );
}

const BODY_PARTS = ['your feet', 'your legs', 'your stomach and chest', 'your hands and arms', 'your shoulders and neck', 'your face and head'];
const RING_DELAYS = [0, 1300, 2600];

function BodyScanRipple({ running }) {
  const rings = useRef([new Animated.Value(0), new Animated.Value(0), new Animated.Value(0)]).current;
  const [partIndex, setPartIndex] = useState(0);

  useEffect(() => {
    if (!running) {
      rings.forEach((r) => { r.stopAnimation(); r.setValue(0); });
      setPartIndex(0);
      return undefined;
    }

    const timeouts = [];
    const loops = [];
    RING_DELAYS.forEach((delay, i) => {
      const t = setTimeout(() => {
        const loop = Animated.loop(
          Animated.timing(rings[i], { toValue: 1, duration: 4000, easing: Easing.out(Easing.ease), useNativeDriver: true })
        );
        loops.push(loop);
        loop.start();
      }, delay);
      timeouts.push(t);
    });

    const partInterval = setInterval(() => {
      setPartIndex((p) => (p + 1) % BODY_PARTS.length);
    }, 12000);

    return () => {
      timeouts.forEach(clearTimeout);
      loops.forEach((l) => l.stop());
      clearInterval(partInterval);
      rings.forEach((r) => r.setValue(0));
    };
  }, [running]);

  return (
    <View style={styles.visualWrap}>
      <View style={styles.rippleOuter}>
        {rings.map((r, i) => (
          <Animated.View
            key={i}
            style={[
              styles.rippleRing,
              {
                opacity: r.interpolate({ inputRange: [0, 1], outputRange: [0.6, 0] }),
                transform: [{ scale: r.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1.6] }) }],
              },
            ]}
          />
        ))}
        <View style={styles.rippleCore} />
      </View>
      <Text style={styles.phaseText}>{running ? `Notice ${BODY_PARTS[partIndex]}` : 'Ready'}</Text>
    </View>
  );
}

function CandleFocus({ running }) {
  const glow = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!running) {
      glow.stopAnimation();
      glow.setValue(0);
      return undefined;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(glow, { toValue: 1, duration: 3500, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(glow, { toValue: 0, duration: 3500, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [running]);

  return (
    <View style={styles.visualWrap}>
      <View style={styles.candleOuter}>
        <Animated.View
          style={[
            styles.candleGlow,
            {
              opacity: glow.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0.7] }),
              transform: [{ scale: glow.interpolate({ inputRange: [0, 1], outputRange: [1, 1.25] }) }],
            },
          ]}
        />
        <Animated.View
          style={[
            styles.candleFlame,
            { transform: [{ scale: glow.interpolate({ inputRange: [0, 1], outputRange: [1, 1.12] }) }] },
          ]}
        />
      </View>
      <Text style={styles.phaseText}>{running ? 'Breathe naturally' : 'Ready'}</Text>
    </View>
  );
}

function ResonantBreathing({ running }) {
  const scale = useRef(new Animated.Value(1)).current;
  const [phase, setPhase] = useState('Ready');

  useEffect(() => {
    if (!running) {
      scale.stopAnimation();
      scale.setValue(1);
      setPhase('Ready');
      return undefined;
    }

    let cancelled = false;

    const runCycle = () => {
      if (cancelled) return;
      setPhase('Inhale');
      Animated.timing(scale, { toValue: 1.5, duration: 5000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }).start(({ finished }) => {
        if (!finished || cancelled) return;
        setPhase('Exhale');
        Animated.timing(scale, { toValue: 1, duration: 5000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }).start(({ finished: doneExhale }) => {
          if (doneExhale && !cancelled) runCycle();
        });
      });
    };
    runCycle();

    return () => {
      cancelled = true;
      scale.stopAnimation();
    };
  }, [running]);

  return (
    <View style={styles.visualWrap}>
      <View style={styles.ringOuter}>
        <Animated.View style={[styles.ringCore, { transform: [{ scale }] }]} />
      </View>
      <Text style={styles.phaseText}>{phase}</Text>
    </View>
  );
}

const PMR_GROUPS = ['Feet', 'Calves & Legs', 'Stomach & Chest', 'Hands & Arms', 'Shoulders & Neck', 'Face'];
const PMR_HOLD_MS = 4200;

// Exported (not just used internally) because this exact technique is also
// a real backend-listed Exercise-tab item, not just a meditation - a physical
// tense/release technique belongs there, not duplicated under Meditation too.
export function ProgressiveMuscleRelaxation({ running, onComplete }) {
  const anim = useRef(new Animated.Value(0)).current;
  const [groupIndex, setGroupIndex] = useState(0);
  const [phase, setPhase] = useState('Ready');

  useEffect(() => {
    if (!running) {
      anim.stopAnimation();
      anim.setValue(0);
      setPhase('Ready');
      setGroupIndex(0);
      return undefined;
    }

    let cancelled = false;
    let holdTimeout = null;

    const runGroup = (idx) => {
      if (cancelled) return;
      if (idx >= PMR_GROUPS.length) {
        setPhase('Complete');
        onComplete?.();
        return;
      }
      setGroupIndex(idx);
      setPhase('Tense');
      Animated.timing(anim, { toValue: 1, duration: 800, useNativeDriver: true }).start(() => {
        if (cancelled) return;
        holdTimeout = setTimeout(() => {
          if (cancelled) return;
          setPhase('Release');
          Animated.timing(anim, { toValue: 0, duration: 800, useNativeDriver: true }).start(() => {
            if (cancelled) return;
            holdTimeout = setTimeout(() => runGroup(idx + 1), PMR_HOLD_MS);
          });
        }, PMR_HOLD_MS);
      });
    };
    runGroup(0);

    return () => {
      cancelled = true;
      if (holdTimeout) clearTimeout(holdTimeout);
      anim.stopAnimation();
    };
  }, [running]);

  const isTense = phase === 'Tense';

  return (
    <View style={styles.visualWrap}>
      <View
        style={[
          styles.pmrOuter,
          { backgroundColor: isTense ? colors.warningLight : colors.successLight },
        ]}
      >
        <Animated.View
          style={[
            styles.pmrCore,
            {
              backgroundColor: isTense ? colors.warning : colors.success,
              transform: [{ scale: anim.interpolate({ inputRange: [0, 1], outputRange: [1.15, 0.75] }) }],
            },
          ]}
        />
      </View>
      <Text style={styles.phaseText}>{phase}</Text>
      {running && phase !== 'Complete' && (
        <Text style={styles.pmrGroupText}>{PMR_GROUPS[groupIndex]}</Text>
      )}
      {phase === 'Complete' && (
        <Text style={styles.pmrGroupText}>Great job - your whole body has relaxed.</Text>
      )}
    </View>
  );
}

// Non-breathing techniques - grounding, self-compassion and visualization are
// standard trauma-stabilization tools distinct from breath-pattern exercises,
// added because the first version of this list was breathing exercises only.

const SENSE_STEPS = [
  { count: 5, icon: 'eye', prompt: 'Look around and silently name 5 things you can see.' },
  { count: 4, icon: 'move', prompt: 'Notice 4 things you can feel or touch right now.' },
  { count: 3, icon: 'volume-2', prompt: 'Listen for 3 things you can hear.' },
  { count: 2, icon: 'wind', prompt: 'Notice 2 things you can smell.' },
  { count: 1, icon: 'coffee', prompt: 'Notice 1 thing you can taste.' },
];

function FiveSenseGrounding({ running, onComplete }) {
  const pulse = useRef(new Animated.Value(0)).current;
  const [stepIndex, setStepIndex] = useState(0);

  useEffect(() => {
    if (!running) {
      pulse.stopAnimation();
      pulse.setValue(0);
      setStepIndex(0);
      return undefined;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 1800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 1800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [running]);

  if (!running) {
    return <View style={styles.visualWrap}><Text style={styles.phaseText}>Ready</Text></View>;
  }

  const step = SENSE_STEPS[stepIndex];
  const isLast = stepIndex === SENSE_STEPS.length - 1;

  return (
    <View style={styles.visualWrap}>
      <View style={styles.groundingOuter}>
        <Animated.View
          style={[
            styles.groundingPulse,
            {
              opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.25, 0.5] }),
              transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.12] }) }],
            },
          ]}
        />
        <Feather name={step.icon} size={26} color={colors.primary} />
        <Text style={styles.groundingCount}>{step.count}</Text>
      </View>
      <Text style={styles.promptText}>{step.prompt}</Text>
      <Pressable
        style={styles.secondaryBtn}
        onPress={() => { if (isLast) onComplete?.(); else setStepIndex((i) => i + 1); }}
      >
        <Text style={styles.secondaryBtnText}>{isLast ? 'Finish' : 'Next'}</Text>
      </Pressable>
    </View>
  );
}

const KINDNESS_PHRASES = [
  'May I be safe.',
  'May I be at peace.',
  'May I be kind to myself.',
  'May I heal, in my own time.',
  'May I know I am not alone.',
];

function LovingKindness({ running }) {
  const glow = useRef(new Animated.Value(0)).current;
  const [phraseIndex, setPhraseIndex] = useState(0);

  useEffect(() => {
    if (!running) {
      glow.stopAnimation();
      glow.setValue(0);
      setPhraseIndex(0);
      return undefined;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(glow, { toValue: 1, duration: 3000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(glow, { toValue: 0, duration: 3000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    );
    loop.start();
    const interval = setInterval(() => setPhraseIndex((p) => (p + 1) % KINDNESS_PHRASES.length), 6000);
    return () => { loop.stop(); clearInterval(interval); };
  }, [running]);

  return (
    <View style={styles.visualWrap}>
      <View style={styles.kindnessOuter}>
        <Animated.View
          style={[
            styles.kindnessGlow,
            {
              opacity: glow.interpolate({ inputRange: [0, 1], outputRange: [0.3, 0.6] }),
              transform: [{ scale: glow.interpolate({ inputRange: [0, 1], outputRange: [1, 1.2] }) }],
            },
          ]}
        />
        <Feather name="heart" size={40} color={colors.primary} />
      </View>
      <Text style={styles.promptText}>{running ? KINDNESS_PHRASES[phraseIndex] : 'Ready'}</Text>
    </View>
  );
}

const SAFE_PLACE_LINES = [
  'Picture a place where you feel completely safe and calm.',
  'It can be real or imagined - a beach, a room, a garden.',
  'Notice what you can see there - the colours, the light.',
  'Notice any sounds, or the quiet.',
  'Notice how your body feels in this safe place.',
  'Stay here for as long as you need.',
];

function SafePlaceVisualization({ running }) {
  const drift = useRef(new Animated.Value(0)).current;
  const [lineIndex, setLineIndex] = useState(0);

  useEffect(() => {
    if (!running) {
      drift.stopAnimation();
      drift.setValue(0);
      setLineIndex(0);
      return undefined;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(drift, { toValue: 1, duration: 5000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(drift, { toValue: 0, duration: 5000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    );
    loop.start();
    const interval = setInterval(() => setLineIndex((i) => (i + 1) % SAFE_PLACE_LINES.length), 9000);
    return () => { loop.stop(); clearInterval(interval); };
  }, [running]);

  return (
    <View style={styles.visualWrap}>
      <View style={styles.safePlaceOuter}>
        <Animated.View
          style={[
            styles.safePlaceCloud,
            styles.safePlaceCloudBack,
            { transform: [{ translateX: drift.interpolate({ inputRange: [0, 1], outputRange: [-14, 14] }) }] },
          ]}
        />
        <Animated.View
          style={[
            styles.safePlaceCloud,
            styles.safePlaceCloudFront,
            { transform: [{ translateX: drift.interpolate({ inputRange: [0, 1], outputRange: [14, -14] }) }] },
          ]}
        />
      </View>
      <Text style={styles.promptText}>{running ? SAFE_PLACE_LINES[lineIndex] : 'Ready'}</Text>
    </View>
  );
}

// Two "3D" exercises - layered gradient-shaded shapes with perspective/tilt
// transforms, since a full 3D engine (three.js/react-three-fiber) would be a
// new heavy dependency this app doesn't otherwise use.

const MOUNTAIN_LINES = [
  'Picture a great mountain, ancient and strong.',
  'Storms may pass over it - rain, wind, even snow.',
  'The mountain does not move. It simply is.',
  'Like the mountain, you can stay steady while feelings pass through you.',
  'You are not the storm. You are the mountain beneath it.',
];

function MountainMeditation({ running }) {
  const drift = useRef(new Animated.Value(0)).current;
  const tilt = useRef(new Animated.Value(0)).current;
  const [lineIndex, setLineIndex] = useState(0);

  useEffect(() => {
    if (!running) {
      drift.stopAnimation();
      tilt.stopAnimation();
      drift.setValue(0);
      tilt.setValue(0);
      setLineIndex(0);
      return undefined;
    }
    const driftLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(drift, { toValue: 1, duration: 6000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(drift, { toValue: 0, duration: 6000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    );
    const tiltLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(tilt, { toValue: 1, duration: 4000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(tilt, { toValue: 0, duration: 4000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    );
    driftLoop.start();
    tiltLoop.start();
    const interval = setInterval(() => setLineIndex((i) => (i + 1) % MOUNTAIN_LINES.length), 9000);
    return () => { driftLoop.stop(); tiltLoop.stop(); clearInterval(interval); };
  }, [running]);

  return (
    <View style={styles.visualWrap}>
      <View style={styles.mountainScene}>
        <Animated.View
          style={[styles.mountainCloud, { transform: [{ translateX: drift.interpolate({ inputRange: [0, 1], outputRange: [-20, 20] }) }] }]}
        />
        <Animated.View
          style={[
            styles.mountainCloud,
            styles.mountainCloudSmall,
            { transform: [{ translateX: drift.interpolate({ inputRange: [0, 1], outputRange: [16, -16] }) }] },
          ]}
        />
        <Animated.View
          style={[
            styles.mountainShape,
            { transform: [{ perspective: 600 }, { rotateX: tilt.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '3deg'] }) }] },
          ]}
        >
          <View style={styles.mountainBase} />
          <View style={styles.mountainCap} />
        </Animated.View>
      </View>
      <Text style={styles.promptText}>{running ? MOUNTAIN_LINES[lineIndex] : 'Ready'}</Text>
    </View>
  );
}

const CONTAINER_STEPS = [
  'Picture a strong container in front of you - a box, a chest, or a safe with a lid.',
  'Imagine placing any difficult thoughts or feelings into it, one by one.',
  'See yourself closing the container, and locking it.',
  'You can choose to open it again later, with your counsellor, when you are ready.',
  'For now, notice the container is closed - and you are safe.',
];

function ContainerExercise({ running, onComplete }) {
  const lid = useRef(new Animated.Value(0)).current;
  const [stepIndex, setStepIndex] = useState(0);

  useEffect(() => {
    if (!running) {
      lid.stopAnimation();
      lid.setValue(0);
      setStepIndex(0);
    }
  }, [running]);

  useEffect(() => {
    if (!running) return;
    const isOpenStep = stepIndex === 1;
    Animated.timing(lid, { toValue: isOpenStep ? 1 : 0, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }).start();
  }, [stepIndex, running]);

  if (!running) {
    return <View style={styles.visualWrap}><Text style={styles.phaseText}>Ready</Text></View>;
  }

  const isLast = stepIndex === CONTAINER_STEPS.length - 1;
  const showLock = stepIndex >= 3;

  return (
    <View style={styles.visualWrap}>
      <View style={styles.containerScene}>
        <LinearGradient colors={[colors.primary, colors.primaryDark]} style={styles.containerFront} />
        <Animated.View
          style={[
            styles.containerLid,
            {
              transform: [
                { translateY: lid.interpolate({ inputRange: [0, 1], outputRange: [0, -34] }) },
                { rotate: lid.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '-8deg'] }) },
              ],
            },
          ]}
        >
          <LinearGradient colors={['#C4AEE8', colors.primary]} style={StyleSheet.absoluteFill} />
        </Animated.View>
        {showLock && (
          <View style={styles.containerLock}>
            <Feather name="lock" size={16} color={colors.white} />
          </View>
        )}
      </View>
      <Text style={styles.promptText}>{CONTAINER_STEPS[stepIndex]}</Text>
      <Pressable
        style={styles.secondaryBtn}
        onPress={() => { if (isLast) onComplete?.(); else setStepIndex((i) => i + 1); }}
      >
        <Text style={styles.secondaryBtnText}>{isLast ? 'Finish' : 'Next'}</Text>
      </Pressable>
    </View>
  );
}

const EXERCISES = [
  {
    id: '478-ring',
    title: '4-7-8 Breathing',
    icon: 'wind',
    description: 'A simple breathing pattern that can help you feel calmer in just a few minutes.',
    instructions: 'Inhale quietly through the nose for 4 counts. Hold for 7 counts. Exhale completely through the mouth for 8 counts. Repeat for 4 rounds.',
    Component: Ring478,
  },
  {
    id: 'box-breathe',
    title: 'Box Breathing',
    icon: 'square',
    description: 'Steady, even breathing to help you feel grounded when things feel like too much.',
    instructions: 'Inhale for 4 counts, hold for 4, exhale for 4, hold for 4. Repeat for several minutes.',
    Component: BoxBreathing,
  },
  {
    id: 'ripple',
    title: 'Body Scan Meditation',
    icon: 'circle',
    description: 'A gentle way to notice and let go of tension, one part of your body at a time.',
    instructions: 'Lie down comfortably. Bring attention slowly from your feet up through your body, releasing tension at each point.',
    Component: BodyScanRipple,
  },
  {
    id: 'candle',
    title: 'Mindful Breathing',
    icon: 'sun',
    description: 'Simply notice your breath. A quiet moment just for you.',
    instructions: 'Sit or lie comfortably. Notice each inhale and exhale. When the mind wanders, gently return attention to the breath.',
    Component: CandleFocus,
  },
  {
    id: 'resonant',
    title: 'Steady Breathing',
    icon: 'droplet',
    description: 'Slow, easy breathing to help your body and mind settle down.',
    instructions: 'Breathe in gently for 5 counts, then out for 5 counts. No holding - just a slow, even rhythm.',
    Component: ResonantBreathing,
  },
  {
    id: 'grounding-54321',
    title: '5-4-3-2-1 Grounding',
    icon: 'eye',
    description: 'A gentle way to feel more present when anxiety feels like too much.',
    instructions: 'Work through your senses one at a time, at your own pace. Tap Next when you are ready to move on.',
    Component: FiveSenseGrounding,
  },
  {
    id: 'loving-kindness',
    title: 'Be Kind to Yourself',
    icon: 'heart',
    description: 'Gentle words for yourself, especially on the days that feel hard.',
    instructions: 'Silently repeat each phrase to yourself, slowly, as it appears. There is no right way to feel while doing this.',
    Component: LovingKindness,
  },
  {
    id: 'safe-place',
    title: 'Your Safe Place',
    icon: 'sunrise',
    description: 'Picture somewhere calm and peaceful, and rest there for a while.',
    instructions: 'Read each line slowly and picture it in as much detail as you can. Stay as long as you like.',
    Component: SafePlaceVisualization,
  },
  {
    id: 'mountain',
    title: 'Mountain Meditation',
    icon: 'triangle',
    description: 'Feel steady and strong, like a mountain, while your feelings pass like weather.',
    instructions: 'Sit comfortably and picture yourself as an unmoving mountain while emotions pass over you like weather.',
    Component: MountainMeditation,
  },
  {
    id: 'container',
    title: 'The Container',
    icon: 'archive',
    description: 'A way to set heavy thoughts aside safely, until you feel ready to look at them again.',
    instructions: 'Work through each step at your own pace. Tap Next when you are ready to move on.',
    Component: ContainerExercise,
  },
];

// Split into a list (browsing) and a player (the opened exercise) so the
// parent screen can render the opened one full-screen instead of squeezed
// inline under the Journal banner and segment tabs.

export function MeditationPlayer({ exercise, onBack }) {
  const [running, setRunning] = useState(false);
  const { Component } = exercise;

  return (
    <View>
      <Pressable style={styles.backRow} onPress={onBack} hitSlop={8}>
        <Feather name="arrow-left" size={16} color={colors.primary} />
        <Text style={styles.backText}>All meditations</Text>
      </Pressable>

      <View style={styles.playerHeroCard}>
        <View style={styles.playerHeaderRow}>
          <View style={styles.playerIconTile}>
            <Feather name={exercise.icon || 'wind'} size={22} color={colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.playerTitle}>{exercise.title}</Text>
            {!!exercise.duration && (
              <View style={styles.durationPill}>
                <Feather name="clock" size={11} color={colors.primary} />
                <Text style={styles.durationPillText}>{exercise.duration}</Text>
              </View>
            )}
          </View>
        </View>

        <Component running={running} onComplete={() => setRunning(false)} />

        <View style={styles.instructionsBox}>
          <View style={styles.instructionsHeader}>
            <Feather name="info" size={13} color={colors.primary} />
            <Text style={styles.instructionsLabel}>How to do this</Text>
          </View>
          <Text style={styles.instructionsText}>{exercise.instructions}</Text>
        </View>

        <Pressable style={styles.primaryBtn} onPress={() => setRunning((r) => !r)}>
          <Text style={styles.primaryBtnText}>{running ? 'Stop' : 'Start'}</Text>
        </Pressable>
      </View>
    </View>
  );
}

// Matches a real backend Exercise-tab item (by title) to one of the
// animated techniques above, the same title-substring approach this file's
// WellnessScreen sibling already uses for getExerciseIcon - so an animation
// can be attached to whichever real exercises the backend happens to list,
// without needing backend changes to carry an animation id.
const NECK_PHASES = ['Tilt right ear to shoulder', 'Tilt left ear to shoulder', 'Roll shoulders backward', 'Roll shoulders forward'];

function animateValue(value, toValue, duration) {
  return new Promise((resolve) => {
    Animated.timing(value, { toValue, duration, useNativeDriver: true }).start(() => resolve());
  });
}

function loopValue(value, toValue, iterations, duration) {
  return new Promise((resolve) => {
    value.setValue(0);
    Animated.loop(
      Animated.timing(value, { toValue, duration, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      { iterations }
    ).start(() => resolve());
  });
}

function NeckShoulderRelease({ running }) {
  const tilt = useRef(new Animated.Value(0)).current;
  const roll = useRef(new Animated.Value(0)).current;
  const [phase, setPhase] = useState('Ready');

  useEffect(() => {
    if (!running) {
      tilt.stopAnimation();
      roll.stopAnimation();
      tilt.setValue(0);
      roll.setValue(0);
      setPhase('Ready');
      return undefined;
    }

    let cancelled = false;

    const run = async () => {
      while (!cancelled) {
        setPhase(NECK_PHASES[0]);
        await animateValue(tilt, 1, 800);
        if (cancelled) return;
        await new Promise((r) => setTimeout(r, 14200));
        if (cancelled) return;

        setPhase(NECK_PHASES[1]);
        await animateValue(tilt, -1, 1000);
        if (cancelled) return;
        await new Promise((r) => setTimeout(r, 14000));
        if (cancelled) return;

        await animateValue(tilt, 0, 500);
        if (cancelled) return;

        setPhase(NECK_PHASES[2]);
        await loopValue(roll, 1, 5, 1600);
        if (cancelled) return;

        setPhase(NECK_PHASES[3]);
        await loopValue(roll, -1, 5, 1600);
        if (cancelled) return;
      }
    };
    run();

    return () => {
      cancelled = true;
      tilt.stopAnimation();
      roll.stopAnimation();
    };
  }, [running]);

  return (
    <View style={styles.visualWrap}>
      <View style={styles.neckScene}>
        <Animated.View
          style={[
            styles.neckHead,
            {
              transform: [
                { translateX: tilt.interpolate({ inputRange: [-1, 0, 1], outputRange: [-14, 0, 14] }) },
                { rotate: tilt.interpolate({ inputRange: [-1, 0, 1], outputRange: ['-18deg', '0deg', '18deg'] }) },
              ],
            },
          ]}
        />
        <View style={styles.neckShoulders}>
          <Animated.View
            style={[
              styles.neckShoulderDot,
              {
                transform: [
                  { translateX: roll.interpolate({ inputRange: [-1, -0.5, 0, 0.5, 1], outputRange: [0, -10, 0, 10, 0] }) },
                  { translateY: roll.interpolate({ inputRange: [-1, -0.5, 0, 0.5, 1], outputRange: [0, -8, -14, -8, 0] }) },
                ],
              },
            ]}
          />
        </View>
      </View>
      <Text style={styles.phaseText}>{phase}</Text>
    </View>
  );
}

const EXERCISE_ANIMATION_MATCHERS = [
  { test: (title) => /muscle|relaxation/i.test(title), Component: ProgressiveMuscleRelaxation },
  { test: (title) => /neck|shoulder/i.test(title), Component: NeckShoulderRelease },
  { test: (title) => /walk/i.test(title), Component: Exercise3DViewer },
];

export function findExerciseAnimation(title = '') {
  return EXERCISE_ANIMATION_MATCHERS.find((m) => m.test(title))?.Component;
}

// The Exercise tab's card text comes straight from the backend, which only
// stores one long paragraph per item (used as the actual instructions once
// opened) - showing that whole paragraph as the card's preview text as well
// reads far denser than every other card in the app. These are short,
// frontend-only teasers used purely for the card preview; the real backend
// text is still what's shown once the exercise is opened.
const EXERCISE_TEASER_MATCHERS = [
  { test: (title) => /muscle|relaxation/i.test(title), teaser: 'Tense and relax each muscle group to help your body let go of stress.' },
  { test: (title) => /neck|shoulder/i.test(title), teaser: 'Simple stretches to ease tightness in your neck and shoulders.' },
  { test: (title) => /walk/i.test(title), teaser: 'A gentle walk to help clear your mind and ease tension in your body.' },
];

export function findExerciseTeaser(title = '') {
  return EXERCISE_TEASER_MATCHERS.find((m) => m.test(title))?.teaser;
}

export function MeditationList({ onSelect }) {
  return (
    <View style={styles.listGap}>
      {EXERCISES.map((ex) => (
        <Pressable key={ex.id} style={styles.exerciseCard} onPress={() => onSelect(ex)}>
          <View style={styles.exerciseIconTile}>
            <Feather name={ex.icon} size={22} color={colors.primary} />
          </View>
          <View style={styles.exerciseTextContainerFull}>
            <Text style={styles.exerciseTitle}>{ex.title}</Text>
            <Text style={styles.exerciseDescription}>{ex.description}</Text>
          </View>
          <Feather name="chevron-right" size={16} color={colors.textSecondary} />
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  listGap: { gap: spacing.lg },
  exerciseCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.card,
  },
  exerciseIconTile: {
    width: 52,
    height: 52,
    borderRadius: radius.lg,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.lg,
  },
  exerciseTextContainerFull: { flex: 1, paddingRight: spacing.md },
  exerciseTitle: { ...typography.bodyStrong, color: colors.textPrimary, fontSize: 15, fontWeight: '700' },
  exerciseDescription: { ...typography.caption, color: colors.textSecondary, marginTop: 4, lineHeight: 16, fontSize: 12 },
  // A tinted pill (matching Home's "Upcoming" session badge) reads with more
  // visual weight than plain gray caption text - used both on the list cards
  // and in the opened player's header.
  durationPill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: colors.primary + '20',
    paddingHorizontal: spacing.sm, paddingVertical: 4,
    borderRadius: radius.pill,
    alignSelf: 'flex-start',
  },
  durationPillText: { ...typography.caption, color: colors.primary, fontWeight: '700', fontSize: 11 },

  backRow: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.lg },
  backText: { ...typography.bodyStrong, color: colors.primary, marginLeft: spacing.xs },
  // Bordered/shadowed card (matching Home's dashboard cards) wraps the whole
  // player instead of the animation/text floating directly on a bare
  // background, which read as visually empty compared to the rest of the app.
  playerHeroCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.xl,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.card,
  },
  playerHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.sm },
  playerIconTile: {
    width: 44, height: 44, borderRadius: radius.pill,
    backgroundColor: colors.primaryLight,
    alignItems: 'center', justifyContent: 'center',
  },
  playerTitle: { ...typography.h2, color: colors.textPrimary, marginBottom: spacing.xs },
  // A bordered callout box (instead of plain paragraph text floating in the
  // card) so the actual how-to steps read as a distinct, findable section
  // rather than blending into the rest of the player.
  instructionsBox: {
    backgroundColor: colors.background,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    marginBottom: spacing.xl,
  },
  instructionsHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: spacing.sm },
  instructionsLabel: { ...typography.label, color: colors.primary },
  instructionsText: { ...typography.body, color: colors.textSecondary, lineHeight: 20 },

  visualWrap: { alignItems: 'center', paddingVertical: spacing.xl },
  phaseText: { ...typography.h2, color: colors.textPrimary, marginTop: spacing.lg },
  // Sentence-length prompts (grounding steps, visualization lines) read
  // better at body weight than phaseText's large heading style, which was
  // sized for one-word breathing labels like "Inhale"/"Hold".
  promptText: {
    ...typography.body,
    color: colors.textPrimary,
    textAlign: 'center',
    lineHeight: 22,
    marginTop: spacing.lg,
    paddingHorizontal: spacing.lg,
    minHeight: 66,
  },
  secondaryBtn: {
    backgroundColor: colors.primaryLight,
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xxl,
    marginTop: spacing.lg,
  },
  secondaryBtnText: { ...typography.bodyStrong, color: colors.primaryDark },

  /* 4-7-8 ring */
  ringOuter: {
    width: 180, height: 180, borderRadius: 90,
    backgroundColor: colors.primaryLight,
    alignItems: 'center', justifyContent: 'center',
  },
  ringCore: { width: 100, height: 100, borderRadius: 50, backgroundColor: colors.primary },

  /* Box breathing */
  boxTrack: {
    width: BOX_SIZE, height: BOX_SIZE,
    borderWidth: 2, borderColor: colors.primaryLight, borderRadius: radius.md,
    marginVertical: spacing.md,
  },
  boxDot: {
    position: 'absolute', top: -8, left: -8,
    width: 16, height: 16, borderRadius: 8, backgroundColor: colors.primary,
  },

  /* Body scan ripple */
  rippleOuter: { width: 180, height: 180, alignItems: 'center', justifyContent: 'center' },
  rippleRing: {
    position: 'absolute',
    width: 100, height: 100, borderRadius: 50,
    borderWidth: 2, borderColor: colors.primary,
  },
  rippleCore: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primary },

  /* Candle focus */
  candleOuter: { width: 180, height: 180, alignItems: 'center', justifyContent: 'center' },
  candleGlow: {
    position: 'absolute', width: 140, height: 140, borderRadius: 70,
    backgroundColor: colors.warning,
  },
  candleFlame: { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.warning },

  /* Progressive muscle relaxation */
  pmrOuter: {
    width: 180, height: 180, borderRadius: 90,
    alignItems: 'center', justifyContent: 'center',
  },
  pmrCore: { width: 90, height: 90, borderRadius: 45 },
  pmrGroupText: { ...typography.bodyStrong, color: colors.textSecondary, marginTop: spacing.sm, textAlign: 'center', paddingHorizontal: spacing.lg },

  /* 5-4-3-2-1 grounding */
  groundingOuter: {
    width: 140, height: 140, borderRadius: 70,
    backgroundColor: colors.primaryLight,
    alignItems: 'center', justifyContent: 'center',
  },
  groundingPulse: {
    position: 'absolute', width: 140, height: 140, borderRadius: 70,
    backgroundColor: colors.primary,
  },
  groundingCount: { ...typography.display, color: colors.primaryDark, marginTop: 2 },

  /* Self-compassion / loving-kindness */
  kindnessOuter: { width: 140, height: 140, alignItems: 'center', justifyContent: 'center' },
  kindnessGlow: {
    position: 'absolute', width: 140, height: 140, borderRadius: 70,
    backgroundColor: colors.primary,
  },

  /* Safe place visualization */
  safePlaceOuter: { width: 180, height: 120, alignItems: 'center', justifyContent: 'center' },
  safePlaceCloud: {
    position: 'absolute', width: 90, height: 40, borderRadius: 24,
    backgroundColor: colors.primaryLight,
  },
  safePlaceCloudBack: { top: 10, opacity: 0.9 },
  safePlaceCloudFront: { top: 50, width: 70, height: 32, backgroundColor: colors.primary, opacity: 0.5 },

  /* Mountain meditation */
  mountainScene: {
    width: 200, height: 160,
    alignItems: 'center', justifyContent: 'flex-end',
    backgroundColor: colors.primaryLight,
    borderRadius: radius.xl,
    overflow: 'hidden',
    paddingBottom: 10,
  },
  mountainCloud: {
    position: 'absolute', top: 14, left: 20,
    width: 64, height: 22, borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.85)',
  },
  mountainCloudSmall: { top: 38, left: 100, width: 46, height: 16 },
  mountainShape: { alignItems: 'center' },
  mountainBase: {
    width: 0, height: 0,
    borderLeftWidth: 70, borderRightWidth: 70, borderBottomWidth: 110,
    borderLeftColor: 'transparent', borderRightColor: 'transparent', borderBottomColor: colors.primaryDark,
  },
  mountainCap: {
    position: 'absolute', top: 8, left: 51,
    width: 0, height: 0,
    borderLeftWidth: 19, borderRightWidth: 19, borderBottomWidth: 28,
    borderLeftColor: 'transparent', borderRightColor: 'transparent', borderBottomColor: colors.white,
  },

  /* Neck and shoulder release */
  neckScene: { width: 140, height: 160, alignItems: 'center', justifyContent: 'flex-end' },
  neckHead: { width: 48, height: 48, borderRadius: 24, backgroundColor: SKIN_TONE, marginBottom: -6 },
  neckShoulders: {
    width: 120, height: 30, borderRadius: 16, backgroundColor: colors.primaryLight,
    alignItems: 'center', justifyContent: 'center',
  },
  neckShoulderDot: { width: 14, height: 14, borderRadius: 7, backgroundColor: SKIN_TONE },

  /* Container exercise */
  containerScene: { width: 140, height: 130, alignItems: 'center', justifyContent: 'flex-end' },
  containerFront: {
    width: 120, height: 90, borderRadius: radius.md,
    position: 'absolute', bottom: 0,
  },
  containerLid: {
    position: 'absolute', top: 22,
    width: 120, height: 26, borderRadius: radius.sm,
    overflow: 'hidden',
  },
  containerLock: {
    position: 'absolute', bottom: 34,
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: colors.primaryDark,
    alignItems: 'center', justifyContent: 'center',
  },

  primaryBtn: {
    backgroundColor: colors.primaryDark,
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xxl,
    alignSelf: 'center',
  },
  primaryBtnText: { ...typography.bodyStrong, color: colors.white },
});
