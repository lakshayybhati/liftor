import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  PanResponder,
  Animated,
  Platform,
  TouchableOpacity,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '@/hooks/useAuth';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const PADDLE_WIDTH = 100;
const PADDLE_HEIGHT = 20;
const BALL_SIZE = 40; // Initial size
const GRAVITY = 0.45; // Slightly adjusted for better feel
const BASE_SPEED = -17; // Higher bounce
const MAX_SPEED = -34; // Higher cap
const ASCENT_SPEED = 28;
const HIGH_SCORE_KEY = 'Liftor_miniGameHighScore';

interface Props {
  visible: boolean;
  planStatus: 'idle' | 'loading' | 'success' | 'error';
  onGameEnd: (score: number) => void;
  loadingMessage?: string;
  onExit?: () => void;
}

export default function PlanLoadingMiniGameOverlay({ visible, planStatus, onGameEnd, loadingMessage, onExit }: Props) {
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const highScoreKey = `${HIGH_SCORE_KEY}:${session?.user?.id ?? 'anon'}`;
  const [score, setScore] = useState(0);
  const [gameOver, setGameOver] = useState(false);
  const [highScore, setHighScore] = useState(0);
  const highScoreRef = useRef(0);

  useEffect(() => {
    highScoreRef.current = highScore;
  }, [highScore]);
  
  // Intro / Countdown State
  const [gamePhase, setGamePhase] = useState<'intro' | 'countdown' | 'playing' | 'gameover'>('intro');
  const [countdown, setCountdown] = useState(3);
  
  // Track if we should close but are waiting for game to start/min time
  const shouldCloseRef = useRef(false);
  const startTimeRef = useRef<number>(0);

  // Game State Refs (Mutable for performance)
  const gameState = useRef({
    ballX: SCREEN_WIDTH / 2,
    ballY: SCREEN_HEIGHT * 0.2,
    vx: (Math.random() - 0.5) * 6, // Reduced horizontal speed
    vy: 0,
    paddleX: (SCREEN_WIDTH - PADDLE_WIDTH) / 2,
    isPlaying: false,
    score: 0,
    speed: BASE_SPEED,
    scale: 1.0,
  });

  // Animated Values for UI
  const ballPos = useRef(new Animated.ValueXY({ x: SCREEN_WIDTH / 2, y: SCREEN_HEIGHT * 0.2 })).current;
  const ballScale = useRef(new Animated.Value(1)).current;
  const paddlePos = useRef(new Animated.Value((SCREEN_WIDTH - PADDLE_WIDTH) / 2)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;
  
  // Intro Animations
  const introFadeAnim = useRef(new Animated.Value(0)).current;
  const countdownScaleAnim = useRef(new Animated.Value(0.5)).current;

  const requestRef = useRef<number>(0);

  const loadHighScore = useCallback(async () => {
    try {
      const stored = await AsyncStorage.getItem(highScoreKey);
      if (stored) {
        const parsed = parseInt(stored, 10);
        if (!Number.isNaN(parsed)) {
          setHighScore(parsed);
          return;
        }
      }
      setHighScore(0);
    } catch (error) {
      console.warn('[MiniGame] Failed to load high score', error);
    }
  }, [highScoreKey]);

  const persistHighScore = useCallback(
    async (newScore: number) => {
      try {
        await AsyncStorage.setItem(highScoreKey, String(newScore));
      } catch (error) {
        console.warn('[MiniGame] Failed to save high score', error);
      }
    },
    [highScoreKey],
  );

  const maybeUpdateHighScore = useCallback(
    (finalScore: number) => {
      if (finalScore > highScoreRef.current) {
        setHighScore(finalScore);
        persistHighScore(finalScore);
        highScoreRef.current = finalScore;
      }
    },
    [persistHighScore],
  );

  // Pan Responder for Paddle
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {},
      onPanResponderMove: (_, gestureState) => {
        if (!gameState.current.isPlaying && gamePhase !== 'playing') return;
        
        // Map touch to paddle x (clamped)
        let newX = gestureState.moveX - PADDLE_WIDTH / 2;
        newX = Math.max(0, Math.min(SCREEN_WIDTH - PADDLE_WIDTH, newX));
        
        gameState.current.paddleX = newX;
        paddlePos.setValue(newX);
      },
      onPanResponderRelease: () => {},
    })
  ).current;

  const resetPhysics = () => {
    gameState.current = {
      ballX: SCREEN_WIDTH / 2,
      ballY: SCREEN_HEIGHT * 0.1, // Higher start point (was 0.15)
      vx: (Math.random() - 0.5) * 8,
      vy: 2, // Slower initial drop (was 5)
      paddleX: gameState.current.paddleX, // Keep paddle where it is
      isPlaying: true,
      score: 0,
      speed: BASE_SPEED,
      scale: 1.0,
    };
    setScore(0);
    setGameOver(false);
    ballPos.setValue({ x: gameState.current.ballX, y: gameState.current.ballY });
    ballScale.setValue(1);
  };

  const restartGame = () => {
    // Skip intro/countdown but let the normal playing effect handle physics reset
    setScore(0);
    setGameOver(false);
    shouldCloseRef.current = false;
    setGamePhase('playing');
  };

  // Main Visibility & Sequence Logic
  useEffect(() => {
    if (visible) {
      loadHighScore();
      // Reset
      setGamePhase('intro');
      setCountdown(3);
      shouldCloseRef.current = false;
      setScore(0);
      setGameOver(false);
      
      // Initial State
      gameState.current.paddleX = (SCREEN_WIDTH - PADDLE_WIDTH) / 2;
      paddlePos.setValue(gameState.current.paddleX);

      // Fade In Overlay
      Animated.timing(opacityAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }).start();

      // Start Sequence
      // 1. Intro Text Fade In
      Animated.sequence([
        Animated.timing(introFadeAnim, {
          toValue: 1,
          duration: 500,
          useNativeDriver: true,
        }),
        Animated.delay(1500), // Read time
        Animated.timing(introFadeAnim, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }),
      ]).start(({ finished }) => {
        if (finished) {
          setGamePhase('countdown');
        }
      });

    } else {
      gameState.current.isPlaying = false;
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    }

    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [visible, loadHighScore]);

  // Countdown Logic
  useEffect(() => {
    if (gamePhase === 'countdown') {
      let count = 3;
      setCountdown(count);
      
      const tick = () => {
        // Pulse animation for number
        countdownScaleAnim.setValue(0.5);
        Animated.spring(countdownScaleAnim, {
          toValue: 1.2,
          friction: 6,
          useNativeDriver: true,
        }).start();

        if (count <= 0) {
          setGamePhase('playing');
          return;
        }
        
        const timeout = setTimeout(() => {
          count -= 1;
          if (count > 0) {
            setCountdown(count);
            tick();
          } else {
            setGamePhase('playing');
          }
        }, 1000);
        return timeout;
      };

      const timer = tick();
      return () => { if (timer) clearTimeout(timer); };
    }
  }, [gamePhase]);

  // Start Game Loop when Phase becomes 'playing'
  useEffect(() => {
    if (gamePhase === 'playing') {
      resetPhysics();
      startTimeRef.current = Date.now();
      requestRef.current = requestAnimationFrame(animate);
    }
  }, [gamePhase]);

  // Watch for Plan Status
  useEffect(() => {
    if (!visible) return;
    
    if (planStatus === 'success' || planStatus === 'error') {
      shouldCloseRef.current = true;
      
      // If we're playing, check if we've played long enough
      if (gamePhase === 'playing') {
        const playedTime = Date.now() - startTimeRef.current;
        if (playedTime > 3000) {
           // Already played enough, close immediately
           endGame();
        }
      }
      // If we're in 'gameover' state (user waiting to retry), close immediately
      else if (gamePhase === 'gameover') {
        endGame();
      }
    }
  }, [planStatus, visible, gamePhase]);

  const endGame = useCallback(() => {
    gameState.current.isPlaying = false;
    if (requestRef.current) cancelAnimationFrame(requestRef.current);
    
    // Fade out then call callback
    Animated.timing(opacityAnim, {
      toValue: 0,
      duration: 300,
      useNativeDriver: true,
    }).start(() => {
      maybeUpdateHighScore(gameState.current.score);
      onGameEnd(gameState.current.score);
    });
  }, [onGameEnd, maybeUpdateHighScore]);

  const animate = (time: number) => {
    if (!gameState.current.isPlaying) return;

    // Check if we should close due to plan ready (with minimum play time check)
    if (shouldCloseRef.current) {
      const playedTime = Date.now() - startTimeRef.current;
      if (playedTime > 3000) { // Ensure at least 3 seconds of gameplay
        endGame();
        return;
      }
    }

    const state = gameState.current;
    
    // Physics Steps
    state.vy += GRAVITY;
    state.ballX += state.vx;
    state.ballY += state.vy;

    // Wall Collisions
    if (state.ballX <= 0 || state.ballX >= SCREEN_WIDTH - (BALL_SIZE * state.scale)) {
      state.vx *= -0.8;
      state.ballX = Math.max(0, Math.min(state.ballX, SCREEN_WIDTH - (BALL_SIZE * state.scale)));
    }

    const topBoundary = insets.top;
    if (state.ballY <= topBoundary && state.vy < 0) {
      state.ballY = topBoundary;
      state.vy = Math.max(Math.abs(state.speed) * 0.5, 10);
    }

    // Paddle Collision
    const paddleY = SCREEN_HEIGHT - insets.bottom - 150;
    const ballBottom = state.ballY + (BALL_SIZE * state.scale);
    const ballCenterX = state.ballX + (BALL_SIZE * state.scale) / 2;

    if (
      state.vy > 0 && 
      ballBottom >= paddleY && 
      ballBottom <= paddleY + PADDLE_HEIGHT + 20 && 
      ballCenterX >= state.paddleX &&
      ballCenterX <= state.paddleX + PADDLE_WIDTH
    ) {
      // SUCCESSFUL BOUNCE
      if (Platform.OS !== 'web') {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }

      state.score += 1;
      state.scale = Math.min(state.scale + 0.09, 1.9);
      
      let nextSpeed = Math.abs(state.speed) * 1.05;
      nextSpeed = Math.min(nextSpeed, Math.abs(MAX_SPEED));
      state.speed = -nextSpeed;
      
      state.vy = -Math.max(nextSpeed, ASCENT_SPEED);
      
      const hitPoint = ballCenterX - (state.paddleX + PADDLE_WIDTH / 2);
      state.vx += hitPoint * 0.15;
      
      setScore(state.score);
      ballScale.setValue(state.scale);
    }

    // Game Over Check
    if (state.ballY > SCREEN_HEIGHT) {
      setGameOver(true);
      setGamePhase('gameover');
      gameState.current.isPlaying = false;
      maybeUpdateHighScore(state.score);
      return;
    }

    ballPos.setValue({ x: state.ballX, y: state.ballY });
    requestRef.current = requestAnimationFrame(animate);
  };

  if (!visible) return null;

  const paddleY = SCREEN_HEIGHT - insets.bottom - 150;

  const handleExit = () => {
    maybeUpdateHighScore(gameState.current.score);
    onExit?.();
  };

  return (
    <Animated.View style={[styles.container, { opacity: opacityAnim }]}>
      <BlurView intensity={90} tint="dark" style={StyleSheet.absoluteFill} />
      
      {/* Exit Button */}
      <TouchableOpacity 
        style={[styles.exitButton, { top: insets.top + 16 }]} 
        onPress={handleExit}
      >
        <Text style={styles.exitButtonText}>Exit Game</Text>
      </TouchableOpacity>

      {/* Intro Text */}
      {gamePhase === 'intro' && (
        <Animated.View style={[styles.centerContainer, { opacity: introFadeAnim }]}>
          <Text style={styles.introText}>Enjoy as we build your amazing plan...</Text>
        </Animated.View>
      )}

      {/* Countdown */}
      {gamePhase === 'countdown' && (
        <View style={styles.centerContainer}>
          <Animated.Text style={[styles.countdownText, { transform: [{ scale: countdownScaleAnim }] }]}>
            {countdown}
          </Animated.Text>
        </View>
      )}

      {/* Game Over Screen */}
      {gamePhase === 'gameover' && (
        <View style={styles.centerContainer}>
          <Text style={styles.gameOverTitle}>Oops!</Text>
          <Text style={styles.gameOverScore}>Score: {score}</Text>
          <Text style={styles.gameOverHighScore}>High score: {highScore}</Text>
          <TouchableOpacity onPress={restartGame} style={styles.restartButton}>
            <Text style={styles.restartButtonText}>Try Again</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Game Elements (Playing OR GameOver to keep background) */}
      {(gamePhase === 'playing' || gamePhase === 'gameover') && (
        <>
          <View style={[styles.scoreContainer, { marginTop: insets.top + 60 }]}>
            <View style={styles.scoreBlock}>
              <Text style={styles.scoreLabel}>SCORE</Text>
              <Text style={styles.scoreValue}>{score}</Text>
            </View>
            <View style={styles.scoreBlock}>
              <Text style={styles.scoreLabel}>HIGH</Text>
              <Text style={styles.highScoreValue}>{highScore}</Text>
            </View>
          </View>
          
          <View style={styles.gameArea} {...panResponder.panHandlers}>
            {/* Only show ball if playing */}
          {gamePhase === 'playing' && (
              <Animated.View
                style={[
                  styles.ball,
                  {
                    transform: [
                      { translateX: ballPos.x },
                      { translateY: ballPos.y },
                      { scale: ballScale }
                    ],
                  },
                ]}
              >
                <Text style={styles.ballText}>💪</Text>
              </Animated.View>
            )}

            <Animated.View
              style={[
                styles.paddle,
                {
                  top: paddleY,
                  transform: [{ translateX: paddlePos }],
                },
              ]}
            >
              <View style={styles.paddleInner} />
            </Animated.View>

            {score === 0 && !gameOver && gamePhase === 'playing' && (
              <View style={[styles.hintContainer, { top: paddleY + 40 }]}>
                <Text style={styles.hintText}>Drag to catch the muscle!</Text>
              </View>
            )}
          </View>

          {/* Loading Message at Bottom */}
          {loadingMessage && (
            <View style={[styles.messageContainer, { bottom: insets.bottom + 20 }]}>
              <View style={styles.spinner}>
                <View style={styles.spinnerInner} />
              </View>
              <Text style={styles.loadingText}>{loadingMessage}</Text>
            </View>
          )}
        </>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9999,
    justifyContent: 'center',
    alignItems: 'center',
  },
  centerContainer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    zIndex: 20,
  },
  introText: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: '700',
    textAlign: 'center',
    lineHeight: 36,
  },
  countdownText: {
    color: '#FFFFFF',
    fontSize: 120,
    fontWeight: '900',
  },
  scoreContainer: {
    position: 'absolute',
    zIndex: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    alignSelf: 'center',
  },
  scoreBlock: {
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.35)',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 16,
    minWidth: 110,
  },
  scoreLabel: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.5,
    marginBottom: 4,
  },
  scoreValue: {
    color: '#FFFFFF',
    fontSize: 36,
    fontWeight: '900',
    textShadowColor: 'rgba(0,0,0,0.3)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 6,
  },
  highScoreValue: {
    color: '#FFD25E',
    fontSize: 32,
    fontWeight: '800',
  },
  gameArea: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 10,
  },
  ball: {
    position: 'absolute',
    width: BALL_SIZE,
    height: BALL_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 5,
  },
  ballText: {
    fontSize: 32,
  },
  paddle: {
    position: 'absolute',
    width: PADDLE_WIDTH,
    height: PADDLE_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  paddleInner: {
    width: '100%',
    height: PADDLE_HEIGHT,
    borderRadius: PADDLE_HEIGHT / 2,
    backgroundColor: '#FFFFFF',
    shadowColor: '#FFFFFF',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 10,
  },
  hintContainer: {
    position: 'absolute',
    width: '100%',
    alignItems: 'center',
  },
  hintText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 14,
  },
  gameOverTitle: {
    color: '#FFFFFF',
    fontSize: 42,
    fontWeight: '800',
    marginBottom: 16,
  },
  gameOverScore: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 26,
    marginBottom: 8,
  },
  gameOverHighScore: {
    color: '#FFD25E',
    fontSize: 16,
    marginBottom: 24,
  },
  restartButton: {
    backgroundColor: '#FFFFFF',
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 100,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  restartButtonText: {
    color: '#000',
    fontSize: 18,
    fontWeight: '700',
  },
  exitButton: {
    position: 'absolute',
    right: 16,
    zIndex: 100,
    padding: 8,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 16,
    backdropFilter: 'blur(10px)',
  },
  exitButtonText: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 12,
    fontWeight: '600',
  },
  messageContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingHorizontal: 32,
    zIndex: 10,
  },
  spinner: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.3)',
    borderTopColor: '#FFFFFF',
    marginBottom: 8,
    // Note: A simple CSS rotation would be better but for now static is fine or we add animation
  },
  spinnerInner: {
    // Optional inner dot
  },
  loadingText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 13,
    textAlign: 'center',
    fontWeight: '500',
  },
});
