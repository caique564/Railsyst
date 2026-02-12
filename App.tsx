
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Camera, AlertTriangle, ShieldAlert, History, Activity, Video, Eye, StopCircle, CheckCircle2, Loader2, Info, ShieldCheck, Microscope } from 'lucide-react';
import { analyzeFrame } from './services/geminiService';
import { VehicleState, AIAnalysis, ViolationRecord } from './types';
import AlarmSound from './components/AlarmSound';

const App: React.FC = () => {
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [vehicleState, setVehicleState] = useState<VehicleState>(VehicleState.NONE);
  const [stopTimer, setStopTimer] = useState<number>(0);
  const [violations, setViolations] = useState<ViolationRecord[]>([]);
  const [currentAnalysis, setCurrentAnalysis] = useState<AIAnalysis | null>(null);
  const [isAlarmActive, setIsAlarmActive] = useState(false);
  const [processingFrame, setProcessingFrame] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const videoChunksRef = useRef<Blob[]>([]);
  const frameIntervalRef = useRef<number | null>(null);
  const stopStartTimeRef = useRef<number | null>(null);
  const hasMetStopRequirement = useRef<boolean>(false);
  const isViolationProcessing = useRef<boolean>(false);

  const isSecure = window.isSecureContext;

  const startCamera = async () => {
    setIsStarting(true);
    setError(null);
    try {
      if (!isSecure && window.location.hostname !== 'localhost') {
        throw new Error("Acesso negado: HTTPS é obrigatório para ativação da visão computacional.");
      }

      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ 
          video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false 
        });
      } catch (e) {
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      }
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        const playPromise = videoRef.current.play();
        if (playPromise !== undefined) {
          playPromise.then(() => {
            setIsMonitoring(true);
            setError(null);
          }).catch(() => setError("Interação necessária: Clique no vídeo para iniciar."));
        }
      }
    } catch (err: any) {
      setError(err.message || "Erro de hardware: Verifique se a câmera está conectada.");
    } finally {
      setIsStarting(false);
    }
  };

  const stopCamera = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      const tracks = (videoRef.current.srcObject as MediaStream).getTracks();
      tracks.forEach(track => track.stop());
      videoRef.current.srcObject = null;
      setIsMonitoring(false);
    }
    if (frameIntervalRef.current) window.clearInterval(frameIntervalRef.current);
    resetMonitoringState();
  };

  const resetMonitoringState = () => {
    setVehicleState(VehicleState.NONE);
    setStopTimer(0);
    stopStartTimeRef.current = null;
    hasMetStopRequirement.current = false;
    isViolationProcessing.current = false;
  };

  const startRecording = () => {
    if (videoRef.current && videoRef.current.srcObject && (!mediaRecorderRef.current || mediaRecorderRef.current.state === 'inactive')) {
      videoChunksRef.current = [];
      try {
        const mediaRecorder = new MediaRecorder(videoRef.current.srcObject as MediaStream);
        mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) videoChunksRef.current.push(e.data); };
        mediaRecorder.start(1000);
        mediaRecorderRef.current = mediaRecorder;
      } catch (e) { console.warn("Recording disabled."); }
    }
  };

  const finalizeViolation = useCallback((analysis: AIAnalysis, photoData: string, finalStopDuration: number) => {
    setTimeout(() => {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.onstop = () => {
          const blob = new Blob(videoChunksRef.current, { type: 'video/webm' });
          const videoUrl = URL.createObjectURL(blob);
          const newViolation: ViolationRecord = {
            id: Math.random().toString(36).substr(2, 9),
            timestamp: Date.now(),
            photoUrl: photoData,
            videoUrl: videoUrl,
            vehicleType: analysis.vehicleType || 'Objeto Detectado',
            durationStopped: finalStopDuration
          };
          setViolations(prev => [newViolation, ...prev]);
          isViolationProcessing.current = false;
          startRecording();
        };
        mediaRecorderRef.current.stop();
      } else {
        const newViolation: ViolationRecord = {
          id: Math.random().toString(36).substr(2, 9),
          timestamp: Date.now(),
          photoUrl: photoData,
          vehicleType: analysis.vehicleType || 'Objeto Detectado',
          durationStopped: finalStopDuration
        };
        setViolations(prev => [newViolation, ...prev]);
        isViolationProcessing.current = false;
      }
    }, 3000);
  }, []);

  const handleViolationTrigger = useCallback((analysis: AIAnalysis) => {
    if (isViolationProcessing.current) return;
    isViolationProcessing.current = true;
    setIsAlarmActive(true);
    setVehicleState(VehicleState.VIOLATION);
    setTimeout(() => setIsAlarmActive(false), 2000);

    let photo = '';
    if (canvasRef.current && videoRef.current) {
      const context = canvasRef.current.getContext('2d');
      if (context) {
        canvasRef.current.width = videoRef.current.videoWidth || 640;
        canvasRef.current.height = videoRef.current.videoHeight || 480;
        context.drawImage(videoRef.current, 0, 0);
        photo = canvasRef.current.toDataURL('image/jpeg', 0.8);
      }
    }
    finalizeViolation(analysis, photo, stopTimer);
  }, [stopTimer, finalizeViolation]);

  const processAnalysis = useCallback((analysis: AIAnalysis) => {
    setCurrentAnalysis(analysis);
    if (!analysis.vehiclePresent) {
      if (vehicleState !== VehicleState.NONE && !isViolationProcessing.current) {
        setVehicleState(VehicleState.NONE);
        stopStartTimeRef.current = null;
        setStopTimer(0);
        hasMetStopRequirement.current = false;
      }
      return;
    }
    
    if (analysis.status === 'approaching' && !isViolationProcessing.current) {
      setVehicleState(VehicleState.APPROACHING);
      startRecording();
    } 
    
    if (analysis.status === 'at_stop_line' && !isViolationProcessing.current) {
      if (!analysis.isMoving) {
        if (stopStartTimeRef.current === null) {
          stopStartTimeRef.current = Date.now();
          setVehicleState(VehicleState.STOPPED);
        } else {
          const duration = Math.floor((Date.now() - stopStartTimeRef.current) / 1000);
          setStopTimer(duration);
          if (duration >= 3) hasMetStopRequirement.current = true;
        }
      } else {
        setVehicleState(VehicleState.APPROACHING);
      }
    }

    if (analysis.status === 'crossing') {
      if (vehicleState !== VehicleState.VIOLATION && vehicleState !== VehicleState.CROSSING && !isViolationProcessing.current) {
        if (!hasMetStopRequirement.current) {
          handleViolationTrigger(analysis);
        } else {
          setVehicleState(VehicleState.CROSSING);
        }
      }
    }
  }, [vehicleState, handleViolationTrigger]);

  useEffect(() => {
    if (isMonitoring) {
      frameIntervalRef.current = window.setInterval(async () => {
        if (videoRef.current && canvasRef.current && !processingFrame) {
          const context = canvasRef.current.getContext('2d');
          if (context && videoRef.current.readyState >= 2) {
            setProcessingFrame(true);
            canvasRef.current.width = 640;
            canvasRef.current.height = 480;
            context.drawImage(videoRef.current, 0, 0, 640, 480);
            const base64 = canvasRef.current.toDataURL('image/jpeg', 0.5).split(',')[1];
            try {
              const analysis = await analyzeFrame(base64);
              processAnalysis(analysis);
            } catch (err) {
              console.error("Frame skip:", err);
            } finally {
              setProcessingFrame(false);
            }
          }
        }
      }, 1500); 
    }
    return () => { if (frameIntervalRef.current) window.clearInterval(frameIntervalRef.current); };
  }, [isMonitoring, processAnalysis, processingFrame]);

  return (
    <div className="min-h-screen flex flex-col p-4 md:p-6 bg-slate-950 text-slate-100 selection:bg-red-500/30">
      <AlarmSound play={isAlarmActive} />
      
      {isAlarmActive && (
        <div className="fixed inset-0 pointer-events-none z-50 animate-pulse border-[15px] border-red-600/20" />
      )}

      <header className="flex flex-col lg:flex-row items-center justify-between mb-8 gap-6 border-b border-slate-800/50 pb-8">
        <div className="flex items-center gap-5">
          <div className="bg-gradient-to-br from-indigo-600 to-red-600 p-4 rounded-[1.5rem] shadow-[0_0_40px_rgba(79,70,229,0.3)] border border-white/10">
            <Microscope className="text-white" size={36} />
          </div>
          <div>
            <h1 className="text-4xl font-black tracking-tight text-white uppercase italic leading-none">
              RAIL<span className="text-indigo-500">LAB</span> 
              <span className="ml-3 text-sm font-black opacity-30 tracking-[0.3em]">MULTI-DETECTION</span>
            </h1>
            <div className="flex items-center gap-2 mt-2">
               <div className={`w-2 h-2 rounded-full animate-pulse ${isMonitoring ? 'bg-emerald-500 shadow-[0_0_10px_#10b981]' : 'bg-slate-700'}`} />
               <p className="text-[10px] text-slate-500 uppercase font-black tracking-[0.2em]">IA de Detecção de Objetos Estranhos</p>
            </div>
          </div>
        </div>
        
        <div className="flex flex-col items-center lg:items-end gap-3 w-full lg:w-auto">
          <button 
            disabled={isStarting}
            onClick={isMonitoring ? stopCamera : startCamera}
            className={`w-full lg:w-80 px-8 py-5 rounded-[2rem] font-black transition-all flex items-center justify-center gap-4 shadow-2xl active:scale-95 disabled:opacity-50 text-xl tracking-tight ${
              isMonitoring 
                ? 'bg-slate-900 text-indigo-400 border border-indigo-500/30' 
                : 'bg-indigo-600 text-white hover:bg-indigo-500 shadow-indigo-600/20'
            }`}
          >
            {isStarting ? <Loader2 className="animate-spin" size={26} /> : isMonitoring ? <StopCircle size={26} /> : <Camera size={26} />}
            {isStarting ? 'CONECTANDO...' : isMonitoring ? 'PARAR ESCANEAMENTO' : 'ATIVAR MODO TESTE'}
          </button>
          
          {error && (
            <div className="flex items-center gap-2 text-[11px] text-red-400 font-black bg-red-950/40 px-5 py-2 rounded-2xl border border-red-500/20">
              <AlertTriangle size={14} /> {error}
            </div>
          )}
        </div>
      </header>

      <main className="grid grid-cols-1 xl:grid-cols-12 gap-8 flex-1 overflow-hidden">
        <div className="xl:col-span-8 flex flex-col gap-6">
          <div className="relative rounded-[3.5rem] overflow-hidden bg-slate-950 aspect-video border-[4px] border-slate-900 shadow-2xl group ring-1 ring-white/5">
            <video 
              ref={videoRef} 
              autoPlay 
              playsInline 
              muted 
              className={`w-full h-full object-cover transition-all duration-700 ${isMonitoring ? 'opacity-100' : 'opacity-0 scale-105'}`} 
            />

            {!isMonitoring && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/95 backdrop-blur-xl">
                <div className="relative p-16 rounded-full bg-slate-900 border border-slate-800 shadow-inner">
                  <Eye size={100} className="text-slate-700" />
                </div>
                <h3 className="text-3xl font-black text-slate-500 uppercase tracking-tighter mt-8">Sensor em Espera</h3>
                <p className="text-slate-600 font-bold max-w-sm text-center mt-3 text-xs tracking-widest leading-relaxed uppercase">Posicione objetos de teste (Mãos, Celulares) na frente da lente.</p>
              </div>
            )}

            {isMonitoring && (
              <>
                <div className="absolute left-0 right-0 top-[75%] flex items-center justify-center pointer-events-none">
                  <div className="w-full h-1 bg-indigo-500/50 shadow-[0_0_30px_rgba(99,102,241,1)] relative">
                    <div className="absolute -top-7 left-10 bg-indigo-600 text-white text-[10px] font-black px-6 py-1.5 rounded-full uppercase tracking-[0.2em]">
                       ÁREA DE CONTROLE DE PARADA (3S)
                    </div>
                  </div>
                </div>

                <div className="absolute top-8 left-8 flex flex-col gap-4 pointer-events-none">
                  <div className={`flex items-center gap-6 px-10 py-5 rounded-[2.5rem] backdrop-blur-3xl border transition-all duration-500 shadow-2xl ${
                    vehicleState === VehicleState.VIOLATION ? 'bg-red-600/40 border-red-400' :
                    vehicleState === VehicleState.STOPPED ? 'bg-emerald-600/40 border-emerald-400' :
                    vehicleState === VehicleState.APPROACHING ? 'bg-amber-600/40 border-amber-400' :
                    'bg-slate-900/80 border-slate-700'
                  }`}>
                    <div className={`p-3 rounded-full ${vehicleState !== VehicleState.NONE ? 'bg-white/20 animate-ping' : 'bg-slate-800'}`}>
                       <Activity size={24} className="text-white" />
                    </div>
                    <div>
                      <p className="text-[10px] text-white/40 font-black uppercase tracking-widest leading-none mb-2">Detecção IA</p>
                      <p className="text-2xl font-black text-white uppercase tracking-tighter leading-none">
                        {vehicleState === VehicleState.VIOLATION ? 'ALVO IGNOROU PARADA' :
                        vehicleState === VehicleState.STOPPED ? `OBJETO PARADO: ${stopTimer}s` :
                        vehicleState === VehicleState.APPROACHING ? 'OBJETO IDENTIFICADO' :
                        vehicleState === VehicleState.CROSSING ? 'TRAVESSIA VALIDADA' :
                        'ESCANEANDO AMBIENTE...'}
                      </p>
                    </div>
                  </div>

                  {stopTimer > 0 && stopTimer < 3 && (
                    <div className="w-72 bg-slate-900/90 rounded-full h-3 overflow-hidden border border-white/10">
                      <div 
                        className="bg-emerald-500 h-full transition-all duration-1000 shadow-[0_0_15px_#10b981]" 
                        style={{ width: `${(stopTimer/3)*100}%` }}
                      />
                    </div>
                  )}
                </div>

                {isAlarmActive && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-red-600/20 backdrop-blur-[2px] z-10 animate-in fade-in duration-300">
                    <ShieldAlert size={140} className="text-white animate-bounce" />
                    <h2 className="text-6xl font-black text-white uppercase tracking-tighter mt-8">REGISTRO DE INFRAÇÃO</h2>
                  </div>
                )}
              </>
            )}
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            <MetricCard label="TEMPO PARADO" value={`${stopTimer}s`} active={stopTimer > 0} color="text-emerald-400" />
            <MetricCard label="TIPO DE OBJETO" value={currentAnalysis?.vehicleType || 'NENHUM'} active={!!currentAnalysis?.vehicleType} color="text-indigo-400" />
            <MetricCard label="CONFORMIDADE" value={hasMetStopRequirement.current ? 'SIM' : 'NÃO'} active={hasMetStopRequirement.current} color="text-emerald-400" />
            <MetricCard label="CAPTURAS" value={violations.length} active={violations.length > 0} color="text-red-500" />
          </div>
        </div>

        <div className="xl:col-span-4 flex flex-col h-[600px] xl:h-auto bg-slate-900/40 border border-slate-800 rounded-[3rem] overflow-hidden backdrop-blur-3xl">
          <div className="p-10 border-b border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <History size={28} className="text-indigo-500" />
              <h2 className="font-black text-white uppercase tracking-[0.2em] text-xl">LOG DE EVENTOS</h2>
            </div>
            {violations.length > 0 && (
              <span className="bg-red-600 text-white text-[10px] font-black px-3 py-1 rounded-full animate-pulse">ALERTA</span>
            )}
          </div>
          
          <div className="flex-1 overflow-y-auto p-8 space-y-6 custom-scrollbar">
            {violations.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center opacity-20">
                <ShieldCheck size={60} className="mb-4" />
                <p className="text-[12px] font-black uppercase tracking-widest text-center leading-loose">Nenhuma infração<br/>no registro atual</p>
              </div>
            ) : (
              violations.map((v) => (
                <div key={v.id} className="bg-slate-950/80 rounded-[2.5rem] border border-slate-800 p-6 group transition-all hover:border-indigo-500/50 shadow-xl">
                  <div className="flex gap-6">
                    <div className="w-24 h-24 rounded-3xl overflow-hidden bg-black shrink-0 border border-slate-800">
                      <img src={v.photoUrl} alt="Evidence" className="w-full h-full object-cover" />
                    </div>
                    <div className="flex-1 min-w-0 flex flex-col justify-between py-1">
                      <div>
                        <div className="flex justify-between items-center mb-2">
                          <span className="text-[10px] font-black text-red-500 uppercase tracking-widest italic">INFRAÇÃO</span>
                          <span className="text-[9px] text-slate-500 font-black">{new Date(v.timestamp).toLocaleTimeString()}</span>
                        </div>
                        <p className="text-xl font-black text-white truncate leading-none uppercase mb-2">{v.vehicleType}</p>
                        <p className="text-[10px] text-slate-400 font-black">
                          Tempo: <span className="text-red-500">{v.durationStopped}s</span> / Meta: 3s
                        </p>
                      </div>
                      
                      {v.videoUrl && (
                        <a href={v.videoUrl} target="_blank" rel="noreferrer" className="mt-4 text-[10px] font-black text-indigo-400 hover:text-indigo-300 flex items-center gap-2 uppercase tracking-widest">
                          <Video size={14} /> Download Evidência
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </main>

      <footer className="mt-6 flex justify-between items-center text-[9px] font-black uppercase tracking-[0.3em] text-slate-700">
        <p>© 2025 RAILSECURE ANALYTICS - LABORATORIAL MODE</p>
        <p className="flex items-center gap-2 italic">
           <Info size={12} /> USO EXPERIMENTAL - SENSIBILIDADE AUMENTADA PARA TESTES MANUAIS
        </p>
      </footer>

      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
};

const MetricCard = ({ label, value, active, color }: { label: string, value: any, active: boolean, color: string }) => (
  <div className={`p-6 rounded-[2.5rem] border transition-all duration-500 ${active ? 'bg-slate-900 border-indigo-500/20 shadow-xl scale-[1.02]' : 'bg-slate-900/10 border-slate-800 opacity-40'}`}>
    <p className="text-[10px] uppercase text-slate-500 font-black mb-2 tracking-widest">{label}</p>
    <p className={`text-3xl font-black truncate tracking-tighter ${color}`}>{value}</p>
  </div>
);

export default App;
