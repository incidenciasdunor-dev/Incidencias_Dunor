/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, Component, ReactNode } from 'react';
import { auth, db } from './lib/firebase';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, sendPasswordResetEmail, signOut, onAuthStateChanged, User } from 'firebase/auth';
import { doc, getDoc, setDoc, collection, query, where, orderBy, onSnapshot, addDoc, updateDoc, deleteDoc, getDocs, collectionGroup, arrayUnion, limit, writeBatch } from 'firebase/firestore';
import { useAuthState } from 'react-firebase-hooks/auth';
import { Plus, LogOut, UserPlus, Users, ClipboardList, CheckCircle2, AlertCircle, ChevronRight, Menu, X, Trash2, Edit2, Phone, Mail, User as UserIcon, School, Lock, Eye, EyeOff, Image as ImageIcon, History, Send, Settings } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from './lib/utils';
import { UserProfile, Incident, UserRole, IncidentStatus, FollowUpComment, SystemSettings } from './types';
import { motion, AnimatePresence } from 'motion/react';

const Logo = ({ className, short = false }: { className?: string, short?: boolean }) => (
  <svg 
    viewBox={short ? "0 0 120 100" : "0 0 400 100"} 
    className={className}
    fill="currentColor"
    xmlns="http://www.w3.org/2000/svg"
  >
    <text 
      x="50%" 
      y="50%" 
      textAnchor="middle" 
      dominantBaseline="central" 
      fontSize={short ? "65" : "38"} 
      fontWeight="900" 
      fontFamily="sans-serif"
    >
      {short ? "D" : "DUNOR"}
    </text>
  </svg>
);

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string;
    email?: string | null;
    emailVerified?: boolean;
    isAnonymous?: boolean;
    tenantId?: string | null;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

class ErrorBoundary extends (Component as any) {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  render() {
    const { hasError, error } = this.state;
    if (hasError) {
      let errorMessage = "Algo salió mal. Por favor intenta de nuevo.";
      try {
        const parsed = JSON.parse(error?.message || "");
        if (parsed.error && parsed.error.includes("insufficient permissions")) {
          errorMessage = "No tienes permisos suficientes para realizar esta acción.";
        } else if (parsed.error) {
          errorMessage = parsed.error;
        }
      } catch (e) {
        if (error?.message) {
          errorMessage = error.message;
        }
      }

      return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
          <div className="bg-white p-8 rounded-2xl shadow-xl max-w-md w-full text-center">
            <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-slate-900 mb-2">Error</h2>
            <p className="text-slate-600 mb-6">{errorMessage}</p>
            <button
              onClick={() => window.location.reload()}
              className="w-full bg-indigo-600 text-white font-bold py-3 rounded-xl hover:bg-indigo-700 transition-all"
            >
              Recargar aplicación
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// --- Components ---

const LoadingScreen = () => (
  <div className="flex flex-col items-center justify-center min-h-screen bg-slate-50">
    <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
    <p className="mt-4 text-slate-600 font-medium">Cargando aplicación...</p>
  </div>
);


const LoginScreen = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [step, setStep] = useState<'email' | 'login' | 'register'>('email');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preProfile, setPreProfile] = useState<UserProfile | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  const checkEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const emailId = email.toLowerCase().trim();
      const docRef = doc(db, 'users', emailId);
      const snapshot = await getDoc(docRef);
      
      if (!snapshot.exists()) {
        setError("Este correo no está registrado en el sistema. Contacta a tu coordinador.");
        setLoading(false);
        return;
      }

      const userData = snapshot.data() as UserProfile;
      setPreProfile({ ...userData, uid: snapshot.id });
      
      if (userData.isRegistered) {
        setStep('login');
      } else {
        setStep('register');
      }
    } catch (err) {
      console.error(err);
      setError("Error al verificar el correo. Por favor, intenta de nuevo.");
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await signInWithEmailAndPassword(auth, email.toLowerCase().trim(), password);
    } catch (err: any) {
      console.error(err);
      if (err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        setError("Credenciales inválidas. Verifica tu correo y contraseña.");
      } else if (err.code === 'auth/user-not-found') {
        setError("Usuario no encontrado.");
      } else {
        setError("Error al iniciar sesión.");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!email) return;
    setLoading(true);
    setError(null);
    try {
      await sendPasswordResetEmail(auth, email.toLowerCase().trim());
      setResetSent(true);
      setError(null);
    } catch (err: any) {
      console.error(err);
      setError("Error al enviar el correo de recuperación. Verifica que el correo sea correcto.");
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      setError("Las contraseñas no coinciden.");
      return;
    }
    if (password.length < 6) {
      setError("La contraseña debe tener al menos 6 caracteres.");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      let user;
      try {
        const result = await createUserWithEmailAndPassword(auth, email.toLowerCase().trim(), password);
        user = result.user;
      } catch (authErr: any) {
        if (authErr.code === 'auth/email-already-in-use') {
          // Requirement 4: User exists in Auth but is being re-added in Firestore
          // We can't set a new password directly, so we trigger a reset
          await sendPasswordResetEmail(auth, email.toLowerCase().trim());
          setError("Este correo ya tiene una cuenta activa en el sistema de autenticación. Se ha enviado un enlace a tu correo para que generes una nueva contraseña.");
          setResetSent(true);
          setLoading(false);
          return;
        } else {
          throw authErr;
        }
      }
      
      // Update the pre-registered profile
      if (preProfile && user) {
        const emailId = email.toLowerCase().trim();
        const newProfile = { 
          ...preProfile, 
          uid: user.uid, // Store the real Auth UID in the field
          isRegistered: true,
          updatedAt: Date.now()
        };
        
        try {
          // Update the existing document with raw email as ID
          await setDoc(doc(db, 'users', emailId), newProfile);
        } catch (fsErr) {
          handleFirestoreError(fsErr, OperationType.WRITE, `users/${emailId}`);
        }
      }
    } catch (err: any) {
      console.error(err);
      if (err.code === 'auth/email-already-in-use') {
        setError("Este correo ya está en uso.");
      } else if (err.message && err.message.includes('permission')) {
        setError("Error de permisos al guardar tu perfil. Contacta al administrador.");
      } else {
        setError("Error al registrar la contraseña: " + (err.message || "Error desconocido"));
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-slate-50 p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md bg-white rounded-2xl shadow-xl p-8"
      >
        <div className="text-center mb-8">
          <div className="w-auto h-24 mx-auto mb-6 flex items-center justify-center rounded-2xl bg-white shadow-sm border border-slate-100 px-6 py-2 text-blue-700">
            <Logo className="h-full hidden md:block" />
            <Logo className="h-full md:hidden" short />
          </div>
          <h1 className="text-3xl font-bold text-slate-900 mb-2">DUNOR</h1>
          <p className="text-slate-600">Sistema de Registro de Incidencias</p>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-100 rounded-xl flex items-center gap-3 text-red-600 text-sm font-medium">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            {error}
          </div>
        )}

        {resetSent && (
          <div className="mb-6 p-4 bg-emerald-50 border border-emerald-100 rounded-xl flex items-center gap-3 text-emerald-600 text-sm font-medium">
            <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
            Se ha enviado un correo para restablecer tu contraseña. Revisa tu bandeja de entrada.
          </div>
        )}

        {step === 'email' && (
          <form onSubmit={checkEmail} className="space-y-4">
            <InputGroup label="Correo Electrónico">
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                <input
                  required
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-12 pr-4 py-3 focus:ring-2 focus:ring-indigo-500 transition-all"
                  placeholder="tu@correo.com"
                />
              </div>
            </InputGroup>
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-xl shadow-lg shadow-indigo-100 transition-all disabled:opacity-50"
            >
              {loading ? 'Verificando...' : 'Siguiente'}
            </button>
          </form>
        )}

        {step === 'login' && (
          <form onSubmit={handleLogin} className="space-y-4">
            <InputGroup label="Correo Electrónico">
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                <input
                  disabled
                  type="email"
                  value={email}
                  className="w-full bg-slate-100 border border-slate-200 rounded-xl pl-12 pr-4 py-3 text-slate-500"
                />
                <button 
                  type="button" 
                  onClick={() => setStep('email')} 
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-indigo-600 font-bold hover:underline"
                >
                  Cambiar
                </button>
              </div>
            </InputGroup>
            <InputGroup label="Contraseña">
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                <input
                  required
                  autoFocus
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-12 pr-12 py-3 focus:ring-2 focus:ring-indigo-500 transition-all"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </InputGroup>
            <div className="flex justify-end">
              <button 
                type="button"
                onClick={handleForgotPassword}
                className="text-xs text-indigo-600 font-bold hover:underline"
              >
                ¿Olvidaste tu contraseña?
              </button>
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-xl shadow-lg shadow-indigo-100 transition-all disabled:opacity-50"
            >
              {loading ? 'Iniciando...' : 'Entrar'}
            </button>
          </form>
        )}

        {step === 'register' && (
          <form onSubmit={handleRegister} className="space-y-4">
            <div className="mb-6">
              <p className="text-sm text-slate-600 leading-relaxed">
                Hola <span className="font-bold text-slate-900">{preProfile?.name}</span>, es tu primera vez. Configura una contraseña para tu cuenta.
              </p>
            </div>
            <InputGroup label="Nueva Contraseña">
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                <input
                  required
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-12 pr-12 py-3 focus:ring-2 focus:ring-indigo-500 transition-all"
                  placeholder="Mínimo 6 caracteres"
                />
              </div>
            </InputGroup>
            <InputGroup label="Confirmar Contraseña">
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                <input
                  required
                  type={showPassword ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-12 pr-12 py-3 focus:ring-2 focus:ring-indigo-500 transition-all"
                  placeholder="Repite tu contraseña"
                />
              </div>
            </InputGroup>
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-xl shadow-lg shadow-indigo-100 transition-all disabled:opacity-50"
            >
              {loading ? 'Configurando...' : 'Establecer Contraseña'}
            </button>
          </form>
        )}
      </motion.div>
    </div>
  );
};

const RoleSelection = ({ user, onRoleSelected }: { user: User, onRoleSelected: (role: UserRole) => void }) => {
  const [loading, setLoading] = useState(false);

  const selectRole = async (role: UserRole) => {
    setLoading(true);
    try {
      const emailId = (user.email || '').toLowerCase().trim();
      const userProfile: UserProfile = {
        uid: user.uid,
        name: user.displayName || 'Usuario',
        email: user.email || '',
        role: role,
      };
      await setDoc(doc(db, 'users', emailId), userProfile);
      onRoleSelected(role);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `users/${user.uid}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-slate-50 p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-8">
        <h2 className="text-2xl font-bold text-slate-900 mb-6 text-center">Selecciona tu rol</h2>
        <div className="grid grid-cols-1 gap-4">
          <button
            disabled={loading}
            onClick={() => selectRole('COORDINATOR')}
            className="flex flex-col items-center p-6 border-2 border-slate-100 rounded-xl hover:border-indigo-600 hover:bg-indigo-50 transition-all group"
          >
            <Users className="w-12 h-12 text-slate-400 group-hover:text-indigo-600 mb-3" />
            <span className="font-bold text-slate-900">Coordinador</span>
            <span className="text-sm text-slate-500 text-center mt-1">Gestiona usuarios e incidencias</span>
          </button>
          <button
            disabled={loading}
            onClick={() => selectRole('TEACHER')}
            className="flex flex-col items-center p-6 border-2 border-slate-100 rounded-xl hover:border-indigo-600 hover:bg-indigo-50 transition-all group"
          >
            <UserIcon className="w-12 h-12 text-slate-400 group-hover:text-indigo-600 mb-3" />
            <span className="font-bold text-slate-900">Docente</span>
            <span className="text-sm text-slate-500 text-center mt-1">Reporta nuevas incidencias</span>
          </button>
        </div>
      </div>
    </div>
  );
};

// --- Main App ---

export default function App() {
  const [user, loading, error] = useAuthState(auth);
  
  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
        <div className="bg-white p-8 rounded-2xl shadow-xl max-w-md w-full text-center">
          <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-slate-900 mb-2">Error de Autenticación</h2>
          <p className="text-slate-600 mb-6">{error.message}</p>
          <p className="text-xs text-slate-400 mb-6">Verifica la configuración de Firebase en Vercel.</p>
          <button
            onClick={() => window.location.reload()}
            className="w-full bg-indigo-600 text-white font-bold py-3 rounded-xl hover:bg-indigo-700 transition-all"
          >
            Recargar aplicación
          </button>
        </div>
      </div>
    );
  }

  return <AppContent user={user} loading={loading} />;
}

function AppContent({ user, loading }: { user: User | null | undefined, loading: boolean }) {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isProfileLoading, setIsProfileLoading] = useState(false);
  const [hasCheckedProfile, setHasCheckedProfile] = useState(false);
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
  });
  const [activeTab, setActiveTab] = useState<'incidents' | 'users' | 'add-incident' | 'notifications' | 'settings'>('incidents');
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [coordinators, setCoordinators] = useState<UserProfile[]>([]);
  const [teachers, setTeachers] = useState<UserProfile[]>([]);
  const [admins, setAdmins] = useState<UserProfile[]>([]);
  const [notifications, setNotifications] = useState<any[]>([]);
  const DEFAULT_SETTINGS: SystemSettings = {
    emailNotificationsEnabled: true,
    forwardingEnabled: false,
    coordinatorAdminMapping: {}
  };

  const [systemSettings, setSystemSettings] = useState<SystemSettings>(DEFAULT_SETTINGS);
  const [selectedMappingAdmin, setSelectedMappingAdmin] = useState('');
  const [selectedMappingCoordinator, setSelectedMappingCoordinator] = useState('');
  const [selectedIncidents, setSelectedIncidents] = useState<string[]>([]);
  const [selectedNotifications, setSelectedNotifications] = useState<string[]>([]);
  const [isNotifSelectionMode, setIsNotifSelectionMode] = useState(false);
  const [expandedIncidentId, setExpandedIncidentId] = useState<string | null>(null);

  const isSuperAdmin = profile?.email?.toLowerCase() === 'jorge.villanueva@boletomovil.com';

  useEffect(() => {
    if (!user) {
      setSystemSettings(DEFAULT_SETTINGS);
      return;
    }
    const unsubscribe = onSnapshot(doc(db, 'settings', 'global'), (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data() as SystemSettings;
        setSystemSettings({
          ...DEFAULT_SETTINGS,
          ...data
        });
      } else {
        setSystemSettings(DEFAULT_SETTINGS);
      }
    }, (error) => {
      console.warn("Settings listener error (likely permissions):", error);
    });
    return () => unsubscribe();
  }, [user]);

  const sendNotification = async (userId: string, title: string, message: string, incidentId?: string) => {
    const notificationData = {
      title,
      message,
      incidentId,
      read: false,
      createdAt: Date.now()
    };

    // Send to specific user
    if (userId) {
      try {
        await addDoc(collection(db, 'notifications'), {
          ...notificationData,
          userId
        });
      } catch (e) {
        console.error("Error sending notification to user:", e);
      }
    }

    // Requirement 1: Send to all admins
    for (const admin of admins) {
      if (admin.uid !== userId) {
        try {
          await addDoc(collection(db, 'notifications'), {
            ...notificationData,
            userId: admin.uid
          });
        } catch (e) {
          console.error("Error sending notification to admin:", e);
        }
      }
    }
  };
  const [showInstallPrompt, setShowInstallPrompt] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);

  useEffect(() => {
    const handleBeforeInstallPrompt = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setShowInstallPrompt(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  useEffect(() => {
    // PWA Install Prompt Logic
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    const isStandalone = (window.navigator as any).standalone || window.matchMedia('(display-mode: standalone)').matches;
    
    if (isMobile && !isStandalone) {
      const hasSeenPrompt = localStorage.getItem('hasSeenInstallPrompt');
      if (!hasSeenPrompt) {
        setShowInstallPrompt(true);
      }
    }

    if (!user || !profile) return;

    // Listen for notifications
    const q = query(
      collection(db, 'notifications'),
      where('userId', '==', profile.uid),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      setNotifications(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'notifications');
    });

    return () => unsubscribe();
  }, [user, profile]);

  const markNotificationAsRead = async (id: string) => {
    try {
      await updateDoc(doc(db, 'notifications', id), { read: true });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `notifications/${id}`);
    }
  };

  useEffect(() => {
    if (profile?.role === 'ADMIN' || isSuperAdmin) {
      const q = query(collection(db, 'users'), where('role', '==', 'ADMIN'), limit(100));
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const users = snapshot.docs.map(doc => doc.data() as UserProfile);
        const uniqueUsers = Array.from(new Map(users.map(u => [u.email, u])).values());
        setAdmins(uniqueUsers);
      }, (error) => {
        handleFirestoreError(error, OperationType.LIST, 'users (admins)');
      });
      return () => unsubscribe();
    }
  }, [profile, isSuperAdmin]);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  useEffect(() => {
    // Bootstrap: Pre-register the first coordinator if the collection is empty
    const bootstrap = async () => {
      try {
        const adminEmail = "jorge.villanueva@boletomovil.com";
        const docRef = doc(db, 'users', adminEmail);
        const snapshot = await getDoc(docRef);
        
        if (!snapshot.exists()) {
          await setDoc(docRef, {
            uid: adminEmail, // Temporary UID until registration
            name: "Administrador Inicial",
            email: adminEmail,
            role: "ADMIN",
            isRegistered: false
          });
        }
      } catch (error) {
        console.error("Bootstrap error:", error);
      }
    };
    bootstrap();
  }, []);

  useEffect(() => {
    if (user && user.email) {
      setIsProfileLoading(true);
      setHasCheckedProfile(false);
      const emailId = user.email.toLowerCase().trim();
      const unsubscribe = onSnapshot(doc(db, 'users', emailId), async (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.data() as UserProfile;
          // Ensure UID matches Auth UID if it was bootstrapped with email or has a mismatch
          if (data.uid !== user.uid) {
            try {
              await updateDoc(doc(db, 'users', emailId), { uid: user.uid });
            } catch (e) {
              console.error("Error updating UID:", e);
            }
          }
          setProfile(data);
        } else {
          setProfile(null);
        }
        setIsProfileLoading(false);
        setHasCheckedProfile(true);
      }, (error) => {
        handleFirestoreError(error, OperationType.GET, `users/${emailId}`);
        setIsProfileLoading(false);
        setHasCheckedProfile(true);
      });
      return () => unsubscribe();
    } else {
      setProfile(null);
      setIsProfileLoading(false);
      setHasCheckedProfile(false);
    }
  }, [user]);

  useEffect(() => {
    if (!profile) return;

    let q;
    if (profile.email === 'jorge.villanueva@boletomovil.com' || profile.role === 'ADMIN') {
      q = query(collection(db, 'incidents'), orderBy('createdAt', 'desc'));
    } else if (profile.role === 'COORDINATOR') {
      q = query(collection(db, 'incidents'), where('coordinatorId', '==', profile.uid), orderBy('createdAt', 'desc'));
    } else {
      q = query(collection(db, 'incidents'), where('reporterId', '==', profile.uid), orderBy('createdAt', 'desc'));
    }

    const unsubscribe = onSnapshot(q, (snapshot) => {
      let docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Incident));
      
      // Filter out soft-deleted incidents for coordinators
      if (profile.role === 'COORDINATOR') {
        docs = docs.filter(doc => !doc.deletedByCoordinators?.includes(profile.uid));
      }
      
      setIncidents(docs);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'incidents');
    });

    return () => unsubscribe();
  }, [profile]);

  useEffect(() => {
    if (profile?.role === 'COORDINATOR' || profile?.role === 'TEACHER' || profile?.role === 'ADMIN' || isSuperAdmin) {
      const q = query(collection(db, 'users'), where('role', '==', 'COORDINATOR'), limit(100));
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const users = snapshot.docs.map(doc => doc.data() as UserProfile);
        // Deduplicate by email (since uid might be missing for pre-registered)
        const uniqueUsers = Array.from(new Map(users.map(u => [u.email, u])).values());
        setCoordinators(uniqueUsers);
      }, (error) => {
        handleFirestoreError(error, OperationType.LIST, 'users (coordinators)');
      });
      return () => unsubscribe();
    }
  }, [profile, isSuperAdmin]);

  useEffect(() => {
    if (profile?.role === 'ADMIN' || isSuperAdmin) {
      const q = query(collection(db, 'users'), where('role', '==', 'TEACHER'), limit(100));
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const users = snapshot.docs.map(doc => doc.data() as UserProfile);
        const uniqueUsers = Array.from(new Map(users.map(u => [u.email, u])).values());
        setTeachers(uniqueUsers);
      }, (error) => {
        handleFirestoreError(error, OperationType.LIST, 'users (teachers)');
      });
      return () => unsubscribe();
    }
  }, [profile, isSuperAdmin]);

  useEffect(() => {
    if (profile?.role === 'COORDINATOR') {
      const q = query(collection(db, 'users'), where('role', '==', 'TEACHER'), limit(100));
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const users = snapshot.docs.map(doc => doc.data() as UserProfile);
        // Deduplicate by email
        const uniqueUsers = Array.from(new Map(users.map(u => [u.email, u])).values());
        setTeachers(uniqueUsers);
      }, (error) => {
        handleFirestoreError(error, OperationType.LIST, 'users (teachers-coordinator)');
      });
      return () => unsubscribe();
    }
  }, [profile]);

  useEffect(() => {
    if (user && user.email === 'jorge.villanueva@boletomovil.com' && !profile && !isProfileLoading) {
      const restoreAdmin = async () => {
        try {
          const emailId = user.email!.toLowerCase().trim();
          await setDoc(doc(db, 'users', emailId), {
            uid: user.uid,
            name: user.displayName || "Administrador",
            email: user.email!,
            role: "COORDINATOR",
            isRegistered: true,
            updatedAt: Date.now()
          });
        } catch (e) {
          console.error("Error restoring admin:", e);
        }
      };
      restoreAdmin();
    }
  }, [user, profile, isProfileLoading]);

  if (loading || (user && user.email && !hasCheckedProfile)) return <LoadingScreen />;
  
  if (!user) return <ErrorBoundary><LoginScreen /></ErrorBoundary>;
  
  if (!profile) return (
    <ErrorBoundary>
      <div className="flex flex-col items-center justify-center min-h-screen bg-slate-50 p-4">
        <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-8 text-center">
          <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-slate-900 mb-2">Acceso No Autorizado</h2>
          <p className="text-slate-600 mb-6">Tu correo no está registrado en el sistema o no tienes un perfil asignado. Contacta a tu administrador.</p>
          <button
            onClick={() => signOut(auth)}
            className="w-full bg-indigo-600 text-white font-bold py-3 rounded-xl hover:bg-indigo-700 transition-all"
          >
            Cerrar sesión
          </button>
        </div>
      </div>
    </ErrorBoundary>
  );

  const handleLogout = () => signOut(auth);

  const markAsReceived = async (incidentId: string) => {
    if (profile.role !== 'COORDINATOR' || isSuperAdmin) return;
    try {
      const incident = incidents.find(i => i.id === incidentId);
      if (!incident) return;

      const updates: any = { isReceived: true };
      
      // Only set status to RECIBIDO if it's currently PENDIENTE
      if (incident.status === 'PENDIENTE' || !incident.status) {
        updates.status = 'RECIBIDO';
      }
      
      // Only set readAt and receivedByName if not already set
      if (!incident.readAt) {
        updates.readAt = Date.now();
        updates.receivedByName = profile.name;
      }

      await updateDoc(doc(db, 'incidents', incidentId), updates);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `incidents/${incidentId}`);
    }
  };

  const updateIncidentStatus = async (incident: Incident, status: IncidentStatus) => {
    if (profile.role !== 'COORDINATOR' && !isSuperAdmin) return;
    try {
      await updateDoc(doc(db, 'incidents', incident.id), { status });

      // Add in-app notification for the teacher
      if (incident.reporterId) {
        await sendNotification(
          incident.reporterId,
          'Actualización de Estatus',
          `El estatus de tu reporte en "${incident.place}" ha cambiado a ${status}.`,
          incident.id
        );
      }

      // Send email notification to the reporter (teacher) if status is EN_SEGUIMIENTO or CERRADO
      if (systemSettings.emailNotificationsEnabled && (status === 'EN_SEGUIMIENTO' || status === 'CERRADO') && incident.reporterEmail) {
        try {
          await fetch('/api/send-email', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              to: incident.reporterEmail,
              subject: `Actualización de Incidencia: ${status === 'EN_SEGUIMIENTO' ? 'En Seguimiento' : 'Cerrada'}`,
              html: `
                <div style="font-family: sans-serif; color: #334155; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden;">
                  <div style="background-color: ${status === 'EN_SEGUIMIENTO' ? '#4f46e5' : '#475569'}; padding: 24px; text-align: center;">
                    <h1 style="color: white; margin: 0; font-size: 24px;">Estatus Actualizado</h1>
                  </div>
                  <div style="padding: 24px;">
                    <p style="font-size: 16px; margin-bottom: 20px;">El estatus de tu reporte de incidencia ha sido actualizado.</p>
                    <div style="background-color: #f8fafc; padding: 16px; border-radius: 8px; margin-bottom: 20px;">
                      <p style="margin: 0 0 8px 0;"><strong>Lugar:</strong> ${incident.place}</p>
                      <p style="margin: 0 0 8px 0;"><strong>Nuevo Estatus:</strong> <span style="color: ${status === 'EN_SEGUIMIENTO' ? '#4f46e5' : '#475569'}; font-weight: bold;">${status === 'EN_SEGUIMIENTO' ? 'En Seguimiento' : 'Cerrado'}</span></p>
                      <p style="margin: 0;"><strong>Actualizado por:</strong> ${profile.name}</p>
                    </div>
                    <p style="font-size: 14px; color: #64748b;">Puedes ingresar al sistema para ver más detalles o el historial de seguimiento.</p>
                  </div>
                </div>
              `
            })
          });
        } catch (emailError) {
          console.error("Error sending status update email:", emailError);
        }
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `incidents/${incident.id}`);
    }
  };

  const updateIncidentFollowUp = async (incident: Incident, followUp: string, history: FollowUpComment[], newCommentText: string) => {
    try {
      await updateDoc(doc(db, 'incidents', incident.id), { 
        followUp,
        followUpHistory: history,
        isReceived: false // Mark as unread so coordinator sees it as "Pendiente"
      });

      // Notify the other party
      const recipientId = profile.role === 'TEACHER' ? incident.coordinatorId : incident.reporterId;
      if (recipientId) {
        await sendNotification(
          recipientId,
          'Nuevo Comentario de Seguimiento',
          `${profile.name} ha comentado en "${incident.place}": ${newCommentText.substring(0, 50)}${newCommentText.length > 50 ? '...' : ''}`,
          incident.id
        );
      }

      // Send email notification to the other party
      if (systemSettings.emailNotificationsEnabled) {
        const recipientEmail = profile.role === 'TEACHER' 
          ? coordinators.find(c => c.uid === incident.coordinatorId)?.email 
          : incident.reporterEmail;
        if (recipientEmail) {
          try {
            await fetch('/api/send-email', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                to: recipientEmail,
                subject: `Nuevo Comentario de Seguimiento: ${incident.place}`,
                html: `
                  <div style="font-family: sans-serif; color: #334155; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden;">
                    <div style="background-color: #4f46e5; padding: 24px; text-align: center;">
                      <h1 style="color: white; margin: 0; font-size: 24px;">Nuevo Seguimiento</h1>
                    </div>
                    <div style="padding: 24px;">
                      <p style="font-size: 16px; margin-bottom: 20px;">Se ha agregado un nuevo comentario de seguimiento a una incidencia.</p>
                      <div style="background-color: #f8fafc; padding: 16px; border-radius: 8px; margin-bottom: 20px;">
                        <p style="margin: 0 0 8px 0;"><strong>Lugar:</strong> ${incident.place}</p>
                        <p style="margin: 0 0 8px 0;"><strong>Docente:</strong> ${profile.name}</p>
                        <p style="margin: 0 0 8px 0;"><strong>Nuevo Comentario:</strong></p>
                        <p style="margin: 0; padding: 12px; background-color: white; border: 1px solid #e2e8f0; border-radius: 6px; color: #475569;">${newCommentText}</p>
                      </div>
                      <p style="font-size: 14px; color: #64748b;">Por favor, ingresa al sistema para revisar el reporte completo.</p>
                    </div>
                  </div>
                `
              })
            });
          } catch (emailError) {
            console.error("Error sending follow-up notification email:", emailError);
          }
        }
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `incidents/${incident.id}`);
    }
  };

  const deleteIncident = async (incident: Incident) => {
    if (profile.role !== 'COORDINATOR' || incident.status !== 'CERRADO') return;
    setConfirmModal({
      isOpen: true,
      title: 'Eliminar Incidencia',
      message: '¿Estás seguro de eliminar esta incidencia de tu panel? El docente que la creó aún podrá verla.',
      onConfirm: async () => {
        try {
          await updateDoc(doc(db, 'incidents', incident.id), {
            deletedByCoordinators: arrayUnion(profile.uid)
          });
          setConfirmModal(prev => ({ ...prev, isOpen: false }));
        } catch (error) {
          handleFirestoreError(error, OperationType.DELETE, `incidents/${incident.id}`);
        }
      }
    });
  };

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setDeferredPrompt(null);
      setShowInstallPrompt(false);
    }
  };

  const forwardIncidentToAdmin = async (incident: Incident, adminId: string) => {
    if (!systemSettings.forwardingEnabled) return;
    if (profile.role !== 'COORDINATOR' && !isSuperAdmin) return;
    if (incident.status !== 'EN_SEGUIMIENTO') return;
    try {
      const admin = admins.find(a => a.uid === adminId);
      if (admin) {
        await sendNotification(
          adminId,
          'Incidencia Reenviada',
          `${profile.name} ha reenviado una incidencia de "${incident.place}" para tu revisión.`,
          incident.id
        );

        await updateDoc(doc(db, 'incidents', incident.id), {
          forwardedTo: arrayUnion(adminId)
        });

        // Send email notification to the admin
        if (systemSettings.emailNotificationsEnabled && admin.email) {
          try {
            await fetch('/api/send-email', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                to: admin.email,
                subject: `Incidencia Reenviada: ${incident.place}`,
                html: `
                  <div style="font-family: sans-serif; color: #334155; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden;">
                    <div style="background-color: #4f46e5; padding: 24px; text-align: center;">
                      <h1 style="color: white; margin: 0; font-size: 24px;">Incidencia Reenviada</h1>
                    </div>
                    <div style="padding: 24px;">
                      <p style="font-size: 16px; margin-bottom: 20px;">${profile.name} ha reenviado una incidencia para tu revisión.</p>
                      <div style="background-color: #f8fafc; padding: 16px; border-radius: 8px; margin-bottom: 20px;">
                        <p style="margin: 0 0 8px 0;"><strong>Lugar:</strong> ${incident.place}</p>
                        <p style="margin: 0 0 8px 0;"><strong>Colegio:</strong> ${incident.school}</p>
                        <p style="margin: 0 0 8px 0;"><strong>Descripción:</strong> ${incident.description}</p>
                      </div>
                      <p style="font-size: 14px; color: #64748b;">Por favor, ingresa al sistema para revisar el reporte completo.</p>
                    </div>
                  </div>
                `
              })
            });
          } catch (emailError) {
            console.error("Error sending forwarding notification email:", emailError);
          }
        }
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `incidents/${incident.id}`);
    }
  };

  const deleteMultipleIncidents = async () => {
    if (selectedIncidents.length === 0) return;
    
    setConfirmModal({
      isOpen: true,
      title: 'Eliminar Incidencias',
      message: `¿Estás seguro de eliminar ${selectedIncidents.length} incidencias seleccionadas? Esta acción no se puede deshacer.`,
      onConfirm: async () => {
        try {
          const batch = writeBatch(db);
          selectedIncidents.forEach(id => {
            batch.delete(doc(db, 'incidents', id));
          });
          await batch.commit();
          setSelectedIncidents([]);
          setConfirmModal(prev => ({ ...prev, isOpen: false }));
        } catch (error) {
          handleFirestoreError(error, OperationType.DELETE, 'incidents/multiple');
        }
      }
    });
  };

  const deleteMultipleNotifications = async () => {
    if (selectedNotifications.length === 0) return;
    
    setConfirmModal({
      isOpen: true,
      title: 'Eliminar Notificaciones',
      message: `¿Estás seguro de eliminar ${selectedNotifications.length} notificaciones seleccionadas?`,
      onConfirm: async () => {
        try {
          const batch = writeBatch(db);
          selectedNotifications.forEach(id => {
            batch.delete(doc(db, 'notifications', id));
          });
          await batch.commit();
          setSelectedNotifications([]);
          setIsNotifSelectionMode(false);
          setConfirmModal(prev => ({ ...prev, isOpen: false }));
        } catch (error) {
          handleFirestoreError(error, OperationType.DELETE, 'notifications/multiple');
        }
      }
    });
  };

  const getInitials = (name: string) => {
    const parts = name.trim().split(/\s+/);
    if (parts.length === 0) return '';
    if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
    return (parts[0].charAt(0) + parts[1].charAt(0)).toUpperCase();
  };

  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-slate-50 flex flex-col md:flex-row">
      {/* Mobile Header */}
      <div className="md:hidden bg-white border-b border-slate-200 p-4 flex items-center justify-between sticky top-0 z-50">
        <button 
          onClick={() => setIsSidebarOpen(!isSidebarOpen)} 
          className="flex items-center gap-2 hover:opacity-80 transition-opacity"
        >
          <div className="w-auto h-8 flex items-center justify-center rounded-lg bg-white shadow-sm border border-slate-100 px-2 text-blue-700">
            <Logo className="h-full" short />
          </div>
          <span className="font-bold text-slate-900">DUNOR</span>
        </button>
        <div className="flex items-center gap-2">
          {/* Notifications or other mobile header actions could go here */}
        </div>
      </div>

      {/* Sidebar */}
      <AnimatePresence>
        {(isSidebarOpen || window.innerWidth >= 768) && (
          <>
            {/* Mobile Overlay */}
            {isSidebarOpen && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setIsSidebarOpen(false)}
                className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-40 md:hidden"
              />
            )}
            <motion.aside
              initial={{ x: -300 }}
              animate={{ x: 0 }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              exit={{ x: -300 }}
              className={cn(
                "fixed top-0 left-0 h-full w-72 bg-white border-r border-slate-200 z-50 md:sticky md:h-screen md:z-30",
                !isSidebarOpen && "hidden md:block"
              )}
            >
              <div className="p-6 flex flex-col h-full overflow-y-auto">
                <div className="flex items-center justify-between mb-10">
                  <div className="flex items-center gap-3">
                    <div className="w-auto h-10 flex items-center justify-center rounded-lg bg-white shadow-sm border border-slate-100 px-3 py-1 text-blue-700">
                      <Logo className="h-full" />
                    </div>
                    <span className="text-xl font-bold text-slate-900 tracking-tight">DUNOR</span>
                  </div>
                  <button onClick={() => setIsSidebarOpen(false)} className="md:hidden p-2 text-slate-400">
                    <X className="w-6 h-6" />
                  </button>
                </div>

                <div className="space-y-1 flex-1">
                <SidebarItem
                  icon={<ClipboardList className="w-5 h-5" />}
                  label="Incidencias"
                  active={activeTab === 'incidents'}
                  onClick={() => { setActiveTab('incidents'); setIsSidebarOpen(false); }}
                />
                <SidebarItem
                  icon={
                    <div className="relative">
                      <Send className="w-5 h-5" />
                      {notifications.some(n => !n.read) && (
                        <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-white" />
                      )}
                    </div>
                  }
                  label="Notificaciones"
                  active={activeTab === 'notifications'}
                  onClick={() => { setActiveTab('notifications'); setIsSidebarOpen(false); }}
                />
                {(profile.role === 'COORDINATOR' || profile.role === 'ADMIN') && (
                  <SidebarItem
                    icon={<Users className="w-5 h-5" />}
                    label="Usuarios"
                    active={activeTab === 'users'}
                    onClick={() => { setActiveTab('users'); setIsSidebarOpen(false); }}
                  />
                )}
                {isSuperAdmin && (
                  <SidebarItem
                    icon={<Settings className="w-5 h-5" />}
                    label="Configuración"
                    active={activeTab === 'settings'}
                    onClick={() => { setActiveTab('settings'); setIsSidebarOpen(false); }}
                  />
                )}
                {profile.role === 'TEACHER' && (
                  <SidebarItem
                    icon={<Plus className="w-5 h-5" />}
                    label="Nueva Incidencia"
                    active={activeTab === 'add-incident'}
                    onClick={() => { setActiveTab('add-incident'); setIsSidebarOpen(false); }}
                  />
                )}
              </div>

              {/* Bottom Section with Logout */}
              <div className="mt-auto pt-6 border-t border-slate-100 bg-white sticky bottom-0">
                <div className="flex items-center gap-3 mb-4 px-2">
                  <div className="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center text-slate-600 font-bold flex-shrink-0">
                    {getInitials(profile.name)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-slate-900 truncate">{profile.name}</p>
                    <p className="text-xs text-slate-500 truncate">
                      {isSuperAdmin ? 'Super Admin' : profile.role}
                    </p>
                  </div>
                </div>
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center gap-3 px-3 py-3 text-slate-600 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all mb-2"
                >
                  <LogOut className="w-5 h-5" />
                  <span className="font-bold">Cerrar sesión</span>
                </button>
              </div>
            </div>
          </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* Main Content */}
      <main className="flex-1 p-4 pt-20 md:pt-8 md:p-8 max-w-5xl mx-auto w-full">
        <AnimatePresence mode="wait">
          {activeTab === 'incidents' && (
            <motion.div
              key="incidents"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
            >
              <div className="flex items-center justify-between mb-8">
                <div>
                  <h1 className="text-2xl font-bold text-slate-900">Registro de Incidencias</h1>
                  <p className="text-slate-500">Visualiza y gestiona los reportes escolares</p>
                </div>
                <div className="flex items-center gap-2">
                  {isSuperAdmin && incidents.length > 0 && (
                    <button
                      onClick={() => {
                        if (selectedIncidents.length === incidents.length) {
                          setSelectedIncidents([]);
                        } else {
                          setSelectedIncidents(incidents.map(i => i.id));
                        }
                      }}
                      className="hidden md:flex items-center gap-2 px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-all"
                    >
                      {selectedIncidents.length === incidents.length ? 'Deseleccionar todo' : 'Seleccionar todo'}
                    </button>
                  )}
                  <button
                    onClick={() => setActiveTab('notifications')}
                    className="relative md:hidden p-3 text-slate-600 hover:bg-slate-100 rounded-full transition-all"
                  >
                    <Send className="w-6 h-6" />
                    {notifications.some(n => !n.read) && (
                      <span className="absolute top-2 right-2 w-3 h-3 bg-red-500 rounded-full border-2 border-white" />
                    )}
                  </button>
                  {profile.role === 'TEACHER' && (
                    <button
                      onClick={() => setActiveTab('add-incident')}
                      className="bg-indigo-600 hover:bg-indigo-700 text-white p-3 rounded-full shadow-lg shadow-indigo-200 transition-all"
                    >
                      <Plus className="w-6 h-6" />
                    </button>
                  )}
                </div>
              </div>

              <div className="space-y-4">
                {isSuperAdmin && selectedIncidents.length > 0 && (
                  <motion.div 
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-indigo-600 text-white p-4 rounded-2xl shadow-lg flex items-center justify-between sticky top-20 z-10"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-white/20 rounded-full flex items-center justify-center font-bold">
                        {selectedIncidents.length}
                      </div>
                      <span className="font-bold">Incidencias seleccionadas</span>
                    </div>
                    <div className="flex gap-2">
                      <button 
                        onClick={() => setSelectedIncidents([])}
                        className="px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-sm font-bold transition-all"
                      >
                        Cancelar
                      </button>
                      <button 
                        onClick={deleteMultipleIncidents}
                        className="px-4 py-2 bg-red-500 hover:bg-red-600 rounded-lg text-sm font-bold flex items-center gap-2 transition-all"
                      >
                        <Trash2 className="w-4 h-4" />
                        Eliminar
                      </button>
                    </div>
                  </motion.div>
                )}

                {incidents.length === 0 ? (
                  <div className="bg-white border-2 border-dashed border-slate-200 rounded-2xl p-12 text-center">
                    <ClipboardList className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                    <p className="text-slate-500 font-medium">No hay incidencias registradas aún.</p>
                  </div>
                ) : (
                  incidents.map((incident) => (
                    <IncidentCard
                      key={incident.id}
                      incident={incident}
                      profile={profile}
                      onMarkReceived={() => markAsReceived(incident.id)}
                      onUpdateStatus={(status: IncidentStatus) => updateIncidentStatus(incident, status)}
                      onUpdateFollowUp={(followUp: string, history: FollowUpComment[], newCommentText: string) => updateIncidentFollowUp(incident, followUp, history, newCommentText)}
                      onDelete={() => deleteIncident(incident)}
                      onForward={(adminId: string) => forwardIncidentToAdmin(incident, adminId)}
                      systemSettings={systemSettings}
                      admins={admins}
                      selectable={isSuperAdmin}
                      selected={selectedIncidents.includes(incident.id)}
                      onSelect={(id) => {
                        setSelectedIncidents(prev => 
                          prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
                        );
                      }}
                      expandedIncidentId={expandedIncidentId}
                    />
                  ))
                )}
              </div>
            </motion.div>
          )}

          {activeTab === 'notifications' && (
            <motion.div
              key="notifications"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
            >
              <div className="flex items-center justify-between mb-8">
                <div>
                  <h1 className="text-2xl font-bold text-slate-900">Notificaciones</h1>
                  <p className="text-slate-500">Mantente al día con tus reportes</p>
                </div>
                {notifications.length > 0 && (
                  <div className="flex gap-2">
                    {isNotifSelectionMode ? (
                      <>
                        <button 
                          onClick={() => {
                            setSelectedNotifications([]);
                            setIsNotifSelectionMode(false);
                          }}
                          className="px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-all"
                        >
                          Cancelar
                        </button>
                        <button 
                          onClick={deleteMultipleNotifications}
                          disabled={selectedNotifications.length === 0}
                          className="px-4 py-2 bg-red-600 text-white text-sm font-bold rounded-xl shadow-lg shadow-red-100 transition-all disabled:opacity-50"
                        >
                          Eliminar ({selectedNotifications.length})
                        </button>
                      </>
                    ) : (
                      <button 
                        onClick={() => setIsNotifSelectionMode(true)}
                        className="px-4 py-2 text-sm font-bold text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all"
                      >
                        Seleccionar
                      </button>
                    )}
                  </div>
                )}
              </div>

              <div className="space-y-3">
                {notifications.length === 0 ? (
                  <div className="bg-white border-2 border-dashed border-slate-200 rounded-2xl p-12 text-center">
                    <Send className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                    <p className="text-slate-500 font-medium">No tienes notificaciones aún.</p>
                  </div>
                ) : (
                  notifications.map((notif) => (
                    <div 
                      key={notif.id}
                      onClick={() => {
                        if (isNotifSelectionMode) {
                          setSelectedNotifications(prev => 
                            prev.includes(notif.id) ? prev.filter(id => id !== notif.id) : [...prev, notif.id]
                          );
                        } else {
                          markNotificationAsRead(notif.id);
                          if (notif.incidentId) {
                            setExpandedIncidentId(notif.incidentId);
                            setActiveTab('incidents');
                          } else {
                            setActiveTab('incidents');
                          }
                        }
                      }}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        setIsNotifSelectionMode(true);
                        setSelectedNotifications(prev => [...prev, notif.id]);
                      }}
                      className={cn(
                        "p-4 rounded-xl border transition-all cursor-pointer relative overflow-hidden",
                        selectedNotifications.includes(notif.id) ? "border-indigo-600 ring-2 ring-indigo-100" : "border-slate-100",
                        notif.read 
                          ? "bg-white opacity-75" 
                          : "bg-indigo-50 border-indigo-100 shadow-sm"
                      )}
                    >
                      {isNotifSelectionMode && (
                        <div className="absolute left-0 top-0 bottom-0 w-1 bg-indigo-600" />
                      )}
                      <div className="flex justify-between items-start mb-1">
                        <div className="flex items-center gap-2">
                          {isNotifSelectionMode && (
                            <div className={cn(
                              "w-4 h-4 rounded border flex items-center justify-center transition-all",
                              selectedNotifications.includes(notif.id) ? "bg-indigo-600 border-indigo-600" : "border-slate-300 bg-white"
                            )}>
                              {selectedNotifications.includes(notif.id) && <CheckCircle2 className="w-3 h-3 text-white" />}
                            </div>
                          )}
                          <h3 className={cn("font-bold", notif.read ? "text-slate-700" : "text-indigo-900")}>
                            {notif.title}
                          </h3>
                        </div>
                        <span className="text-[10px] text-slate-400 font-medium">
                          {format(notif.createdAt, "dd/MM HH:mm")}
                        </span>
                      </div>
                      <p className={cn("text-sm", notif.read ? "text-slate-500" : "text-indigo-700")}>
                        {notif.message}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </motion.div>
          )}

          {activeTab === 'users' && (profile.role === 'COORDINATOR' || profile.role === 'ADMIN') && (
            <motion.div
              key="users"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
            >
              <UserManagement profile={profile} coordinators={coordinators} teachers={teachers} admins={admins} />
            </motion.div>
          )}

          {activeTab === 'add-incident' && profile.role === 'TEACHER' && (
            <motion.div
              key="add-incident"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
            >
              <IncidentForm
                profile={profile}
                coordinators={coordinators}
                onSuccess={() => setActiveTab('incidents')}
                onCancel={() => setActiveTab('incidents')}
                sendNotification={sendNotification}
                systemSettings={systemSettings}
              />
            </motion.div>
          )}

          {activeTab === 'settings' && isSuperAdmin && (
            <motion.div
              key="settings"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-6"
            >
              <div className="mb-8">
                <h1 className="text-2xl font-bold text-slate-900">Configuración del Sistema</h1>
                <p className="text-slate-500">Administra las notificaciones y permisos globales</p>
              </div>

              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="p-6 border-b border-slate-100">
                  <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                    <Mail className="w-5 h-5 text-indigo-600" />
                    Notificaciones por Correo
                  </h2>
                  <p className="text-sm text-slate-500 mt-1">Habilita o deshabilita el envío de correos electrónicos automáticos.</p>
                </div>
                <div className="p-6 flex items-center justify-between">
                  <span className="font-medium text-slate-700">Estado del servicio</span>
                  <button
                    onClick={async () => {
                      try {
                        await setDoc(doc(db, 'settings', 'global'), {
                          emailNotificationsEnabled: !systemSettings.emailNotificationsEnabled
                        }, { merge: true });
                      } catch (error) {
                        console.error("Error updating email settings:", error);
                      }
                    }}
                    className={cn(
                      "relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2",
                      systemSettings.emailNotificationsEnabled ? "bg-indigo-600" : "bg-slate-200"
                    )}
                  >
                    <span
                      className={cn(
                        "inline-block h-4 w-4 transform rounded-full bg-white transition-transform",
                        systemSettings.emailNotificationsEnabled ? "translate-x-6" : "translate-x-1"
                      )}
                    />
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
      {/* PWA Install Prompt */}
      <AnimatePresence>
        {showInstallPrompt && (
          <div className="fixed bottom-4 left-4 right-4 z-[100]">
            <motion.div
              initial={{ y: 100, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 100, opacity: 0 }}
              className="bg-white rounded-2xl shadow-2xl border border-indigo-100 p-5 flex items-center gap-4"
            >
              <div className="w-auto h-12 px-4 bg-indigo-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-indigo-100 flex-shrink-0">
                <Logo className="h-8" short />
              </div>
              <div className="flex-1">
                <h4 className="font-bold text-slate-900 text-sm">Instalar Diario</h4>
                <p className="text-xs text-slate-500">Añade la app a tu pantalla de inicio para un acceso rápido y mejor experiencia.</p>
              </div>
              <div className="flex flex-col gap-2">
                <button 
                  onClick={handleInstallClick}
                  className="px-4 py-2 bg-indigo-600 text-white text-xs font-bold rounded-lg shadow-md shadow-indigo-100"
                >
                  Instalar
                </button>
                <button 
                  onClick={() => {
                    setShowInstallPrompt(false);
                    localStorage.setItem('hasSeenInstallPrompt', 'true');
                  }}
                  className="text-[10px] text-slate-400 font-bold hover:text-slate-600"
                >
                  Más tarde
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Confirmation Modal */}
      <AnimatePresence>
        {confirmModal.isOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative w-full max-w-sm bg-white rounded-2xl shadow-2xl p-6"
            >
              <div className="flex items-center gap-4 mb-4 text-red-600">
                <div className="w-12 h-12 bg-red-50 rounded-full flex items-center justify-center">
                  <AlertCircle className="w-6 h-6" />
                </div>
                <h3 className="text-xl font-bold text-slate-900">{confirmModal.title}</h3>
              </div>
              <p className="text-slate-600 mb-8">{confirmModal.message}</p>
              <div className="flex gap-3">
                <button
                  onClick={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
                  className="flex-1 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold transition-all"
                >
                  Cancelar
                </button>
                <button
                  onClick={confirmModal.onConfirm}
                  className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl font-bold shadow-lg shadow-red-100 transition-all"
                >
                  Eliminar
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </ErrorBoundary>
  );
}

// --- Sub-components ---

const SidebarItem = ({ icon, label, active, onClick }: { icon: React.ReactNode, label: string, active: boolean, onClick: () => void }) => (
  <button
    onClick={onClick}
    className={cn(
      "w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all font-medium",
      active
        ? "bg-indigo-50 text-indigo-600"
        : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
    )}
  >
    {icon}
    <span>{label}</span>
  </button>
);

interface IncidentCardProps {
  incident: Incident;
  profile: UserProfile;
  onMarkReceived: () => void | Promise<void>;
  onUpdateStatus: (status: IncidentStatus) => void | Promise<void>;
  onUpdateFollowUp: (followUp: string, history: FollowUpComment[], newCommentText: string) => void | Promise<void>;
  onDelete: () => void | Promise<void>;
  onForward: (adminId: string) => void | Promise<void>;
  systemSettings: SystemSettings;
  admins: UserProfile[];
  selectable?: boolean;
  selected?: boolean;
  onSelect?: (id: string) => void;
  expandedIncidentId?: string | null;
}

const IncidentCard: React.FC<IncidentCardProps> = ({ incident, profile, onMarkReceived, onUpdateStatus, onUpdateFollowUp, onDelete, onForward, systemSettings, admins, selectable, selected, onSelect, expandedIncidentId }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [newComment, setNewComment] = useState('');
  const [isEditingFollowUp, setIsEditingFollowUp] = useState(false);
  const role = profile.role;
  const isSuperAdmin = profile.email === 'jorge.villanueva@boletomovil.com';

  useEffect(() => {
    if (expandedIncidentId === incident.id) {
      setIsExpanded(true);
      // Scroll into view if needed
      const element = document.getElementById(`incident-${incident.id}`);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }, [expandedIncidentId, incident.id]);

  useEffect(() => {
    if (isExpanded && role === 'COORDINATOR' && !incident.isReceived && !isSuperAdmin) {
      onMarkReceived();
    }
  }, [isExpanded, role, incident.isReceived, onMarkReceived, isSuperAdmin]);

  const handleAddComment = () => {
    if (!newComment.trim()) return;
    
    const comment: FollowUpComment = {
      comment: newComment.trim(),
      timestamp: Date.now(),
      authorName: profile.name
    };
    
    const updatedHistory = [...(incident.followUpHistory || []), comment];
    const updatedFollowUp = incident.followUp ? `${incident.followUp}\n\n${newComment.trim()}` : newComment.trim();
    
    onUpdateFollowUp(updatedFollowUp, updatedHistory, newComment.trim());
    setNewComment('');
    setIsEditingFollowUp(false);
  };

  const getStatusColor = (status?: IncidentStatus) => {
    switch (status) {
      case 'RECIBIDO': return 'text-emerald-600 bg-emerald-50';
      case 'EN_SEGUIMIENTO': return 'text-indigo-600 bg-indigo-50';
      case 'CERRADO': return 'text-slate-600 bg-slate-100';
      default: return 'text-amber-600 bg-amber-50';
    }
  };

  const getStatusLabel = (status?: IncidentStatus) => {
    switch (status) {
      case 'RECIBIDO': return 'Recibido';
      case 'EN_SEGUIMIENTO': return 'En Seguimiento';
      case 'CERRADO': return 'Cerrado';
      default: return 'Pendiente';
    }
  };

  return (
    <div 
      id={`incident-${incident.id}`}
      className={cn(
        "bg-white rounded-2xl border transition-all duration-200",
        selected ? "border-indigo-600 ring-2 ring-indigo-100 shadow-md" : "border-slate-200",
        !incident.isReceived && role === 'COORDINATOR' ? "border-l-4 border-l-indigo-600 shadow-md" : "hover:shadow-md"
      )}
    >
      <div className="flex items-stretch">
        {selectable && (
          <div 
            onClick={(e) => {
              e.stopPropagation();
              onSelect?.(incident.id);
            }}
            className="flex items-center justify-center px-4 border-r border-slate-100 cursor-pointer hover:bg-slate-50 transition-colors"
          >
            <div className={cn(
              "w-5 h-5 rounded border-2 flex items-center justify-center transition-all",
              selected ? "bg-indigo-600 border-indigo-600" : "border-slate-300 bg-white"
            )}>
              {selected && <CheckCircle2 className="w-4 h-4 text-white" />}
            </div>
          </div>
        )}
        <div className="flex-1 p-5 cursor-pointer" onClick={() => setIsExpanded(!isExpanded)}>
          <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-bold text-indigo-600 uppercase tracking-wider">{incident.school}</span>
              <span className="text-slate-300">•</span>
              <span className="text-xs text-slate-500">{incident.date}</span>
              {(incident.status === 'EN_SEGUIMIENTO' || incident.status === 'CERRADO') && (
                <>
                  <span className="text-slate-300">•</span>
                  <span className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded uppercase tracking-tight", getStatusColor(incident.status))}>
                    {getStatusLabel(incident.status)}
                  </span>
                </>
              )}
            </div>
            <h3 className="text-lg font-bold text-slate-900 mb-1">{incident.place}</h3>
            <div className="flex items-center gap-3">
              <p className="text-sm text-slate-600 line-clamp-1">Alumnos: {incident.students}</p>
            </div>
          </div>
          <div className="flex flex-col items-end gap-2">
            <div className="flex flex-col items-end">
              <div className={cn(
                "flex items-center gap-1 px-2 py-1 rounded-full text-xs font-bold", 
                (!incident.isReceived && role === 'COORDINATOR') ? 'text-amber-600 bg-amber-50' : getStatusColor(incident.status)
              )}>
                {(!incident.isReceived && role === 'COORDINATOR') 
                  ? <AlertCircle className="w-3 h-3" /> 
                  : (incident.status === 'RECIBIDO' || incident.isReceived ? <CheckCircle2 className="w-3 h-3" /> : <AlertCircle className="w-3 h-3" />)
                }
                {(!incident.isReceived && role === 'COORDINATOR') 
                  ? 'Pendiente' 
                  : (incident.isReceived && role === 'COORDINATOR' ? 'Recibido' : getStatusLabel(incident.status))
                }
              </div>
              {incident.readAt && (
                <div className="text-[10px] text-slate-400 font-medium mt-1 text-right">
                  <p>Leído el:</p>
                  <p>{format(incident.readAt, "dd/MM/yyyy HH:mm")}</p>
                </div>
              )}
            </div>
            <ChevronRight className={cn("w-5 h-5 text-slate-400 transition-transform", isExpanded && "rotate-90")} />
          </div>
        </div>
      </div>
    </div>

      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="border-t border-slate-100 bg-slate-50/50"
          >
            <div className="p-5 space-y-6">
              {(role === 'COORDINATOR' || isSuperAdmin) && (
                <div className="flex items-center gap-2 pb-4 border-b border-slate-200">
                  <span className="text-xs font-bold text-slate-400 uppercase">Cambiar Estatus:</span>
                  {incident.status !== 'EN_SEGUIMIENTO' && (incident.status !== 'CERRADO' || isSuperAdmin) && (
                    <button
                      onClick={() => onUpdateStatus('EN_SEGUIMIENTO')}
                      className="px-3 py-1 bg-indigo-100 text-indigo-700 rounded-lg text-xs font-bold hover:bg-indigo-200 transition-all"
                    >
                      En Seguimiento
                    </button>
                  )}
                  {incident.status !== 'CERRADO' && (
                    <button
                      onClick={() => onUpdateStatus('CERRADO')}
                      className="px-3 py-1 bg-slate-200 text-slate-700 rounded-lg text-xs font-bold hover:bg-slate-300 transition-all"
                    >
                      Cerrar
                    </button>
                  )}
                </div>
              )}

              <DetailSection label="Descripción de los hechos" content={incident.description} />
              <DetailSection label="Medidas disciplinarias" content={incident.disciplinaryMeasures} />
              
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-bold text-slate-400 uppercase">Seguimiento</p>
                  {role === 'TEACHER' && incident.status === 'EN_SEGUIMIENTO' && !isEditingFollowUp && (
                    <button 
                      onClick={() => setIsEditingFollowUp(true)}
                      className="text-indigo-600 hover:text-indigo-700 flex items-center gap-1 text-xs font-bold"
                    >
                      <Plus className="w-3 h-3" /> Agregar comentario
                    </button>
                  )}
                </div>
                
                <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-4">
                  <p className="text-sm text-slate-700 whitespace-pre-wrap">{incident.followUp || 'Sin seguimiento aún.'}</p>
                  
                  {incident.followUpHistory && incident.followUpHistory.length > 0 && (
                    <div className="pt-4 border-t border-slate-100 space-y-3">
                      <div className="flex items-center gap-2 text-xs font-bold text-slate-400">
                        <History className="w-3 h-3" /> Historial de comentarios
                      </div>
                      {incident.followUpHistory.map((h, i) => (
                        <div key={i} className="text-xs bg-slate-50 p-2 rounded-lg border border-slate-100">
                          <div className="flex justify-between mb-1">
                            <span className="font-bold text-slate-700">{h.authorName}</span>
                            <span className="text-slate-400">{format(h.timestamp, "dd/MM HH:mm")}</span>
                          </div>
                          <p className="text-slate-600">{h.comment}</p>
                        </div>
                      ))}
                    </div>
                  )}

                  {isEditingFollowUp && (
                    <div className="pt-4 border-t border-slate-100 space-y-3">
                      <textarea
                        value={newComment}
                        onChange={(e) => setNewComment(e.target.value)}
                        placeholder="Escribe tu comentario de seguimiento..."
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 transition-all"
                        rows={3}
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={handleAddComment}
                          className="flex-1 bg-indigo-600 text-white py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-2"
                        >
                          <Send className="w-3 h-3" /> Actualizar y Notificar
                        </button>
                        <button
                          onClick={() => { setIsEditingFollowUp(false); setNewComment(''); }}
                          className="px-4 py-2 bg-slate-100 text-slate-600 rounded-lg text-xs font-bold"
                        >
                          Cancelar
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {incident.images && incident.images.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-bold text-slate-400 uppercase flex items-center gap-1">
                    <ImageIcon className="w-3 h-3" /> Evidencia Fotográfica
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {incident.images.map((img, idx) => (
                      <a key={idx} href={img} target="_blank" rel="noreferrer" className="w-24 h-24 rounded-xl overflow-hidden border border-slate-200 hover:opacity-80 transition-all shadow-sm">
                        <img src={img} alt={`Evidencia ${idx}`} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                      </a>
                    ))}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-slate-200">
                <div className="space-y-3">
                  <div>
                    <p className="text-xs font-bold text-slate-400 uppercase mb-1">Reportado por</p>
                    <p className="text-sm font-medium text-slate-900">{incident.reporterName}</p>
                  </div>
                  {incident.receivedByName && (
                    <div>
                      <p className="text-xs font-bold text-slate-400 uppercase mb-1">Recibido por</p>
                      <p className="text-sm font-medium text-slate-900">{incident.receivedByName}</p>
                    </div>
                  )}
                </div>
                {role === 'COORDINATOR' && incident.status === 'CERRADO' && (
                  <div className="flex justify-end items-end">
                    <button
                      onClick={(e) => { e.stopPropagation(); onDelete(); }}
                      className="flex items-center gap-2 text-red-600 hover:bg-red-50 px-3 py-2 rounded-lg transition-all text-sm font-bold"
                    >
                      <Trash2 className="w-4 h-4" />
                      Eliminar
                    </button>
                  </div>
                )}
              </div>

            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

const DetailSection = ({ label, content }: { label: string, content: string }) => (
  <div>
    <p className="text-xs font-bold text-slate-400 uppercase mb-1">{label}</p>
    <p className="text-sm text-slate-700 whitespace-pre-wrap">{content || 'Sin información'}</p>
  </div>
);

const IncidentForm = ({ profile, coordinators, onSuccess, onCancel, sendNotification, systemSettings }: { profile: UserProfile, coordinators: UserProfile[], onSuccess: () => void, onCancel: () => void, sendNotification: (userId: string, title: string, message: string, incidentId?: string) => Promise<void>, systemSettings: SystemSettings }) => {
  const [loading, setLoading] = useState(false);
  const [processingImages, setProcessingImages] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    place: '',
    students: '',
    description: '',
    disciplinaryMeasures: '',
    followUp: '',
    coordinatorId: '',
    school: 'Diario Victoria',
  });
  const [images, setImages] = useState<string[]>([]);

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files) {
      const fileList = Array.from(files);
      if (images.length + fileList.length > 5) {
        setError('Máximo 5 imágenes permitidas');
        return;
      }
      
      setProcessingImages(prev => prev + fileList.length);
      fileList.forEach((file: any) => {
        const reader = new FileReader();
        reader.onerror = () => {
          setProcessingImages(prev => Math.max(0, prev - 1));
          setError('Error al leer el archivo');
        };
        reader.onloadend = () => {
          const img = new Image();
          img.onerror = () => {
            setProcessingImages(prev => Math.max(0, prev - 1));
            setError('Error al cargar la imagen');
          };
          img.onload = () => {
            const canvas = document.createElement('canvas');
            let width = img.width;
            let height = img.height;

            // Max dimension 600px for better performance and size
            const MAX_DIM = 600;
            if (width > height) {
              if (width > MAX_DIM) {
                height *= MAX_DIM / width;
                width = MAX_DIM;
              }
            } else {
              if (height > MAX_DIM) {
                width *= MAX_DIM / height;
                height = MAX_DIM;
              }
            }

            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx?.drawImage(img, 0, 0, width, height);
            
            // Compress to jpeg with 0.5 quality to ensure it fits in Firestore
            const compressedBase64 = canvas.toDataURL('image/jpeg', 0.5);
            setImages(prev => [...prev, compressedBase64]);
            setProcessingImages(prev => Math.max(0, prev - 1));
          };
          img.src = reader.result as string;
        };
        reader.readAsDataURL(file);
      });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.coordinatorId) {
      setError('Por favor selecciona un coordinador');
      return;
    }

    if (processingImages > 0) {
      setError('Espera a que las imágenes terminen de procesarse');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const now = new Date();
      const newIncident: any = {
        ...formData,
        date: format(now, "dd/MM/yyyy HH:mm"),
        reporterName: profile.name,
        reporterId: profile.uid,
        reporterEmail: profile.email,
        isReceived: false,
        status: 'PENDIENTE',
        createdAt: Date.now(),
      };

      if (images.length > 0) {
        newIncident.images = images;
      }

      const docRef = await addDoc(collection(db, 'incidents'), newIncident);
      
      // Add in-app notification for the coordinator
      await sendNotification(
        formData.coordinatorId,
        'Nueva Incidencia',
        `Se ha registrado una nueva incidencia en "${formData.place}" por ${profile.name}.`,
        docRef.id
      );

      // Send email notification to the coordinator
      if (systemSettings.emailNotificationsEnabled) {
        const coordinator = coordinators.find(c => c.uid === formData.coordinatorId);
        if (coordinator && coordinator.email) {
          try {
            await fetch('/api/send-email', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                to: coordinator.email,
                subject: `Nueva Incidencia Reportada: ${formData.place}`,
                html: `
                  <div style="font-family: sans-serif; color: #334155; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden;">
                    <div style="background-color: #4f46e5; padding: 24px; text-align: center;">
                      <h1 style="color: white; margin: 0; font-size: 24px;">Nueva Incidencia</h1>
                    </div>
                    <div style="padding: 24px;">
                      <p style="font-size: 16px; margin-bottom: 20px;">Se ha registrado una nueva incidencia que requiere tu atención.</p>
                      <div style="background-color: #f8fafc; padding: 16px; border-radius: 8px; margin-bottom: 20px;">
                        <p style="margin: 0 0 8px 0;"><strong>Reportado por:</strong> ${profile.name}</p>
                        <p style="margin: 0 0 8px 0;"><strong>Lugar:</strong> ${formData.place}</p>
                        <p style="margin: 0 0 8px 0;"><strong>Alumnos:</strong> ${formData.students}</p>
                        <p style="margin: 0;"><strong>Descripción:</strong> ${formData.description}</p>
                      </div>
                      <p style="font-size: 14px; color: #64748b;">Por favor, ingresa al sistema para dar seguimiento.</p>
                    </div>
                  </div>
                `
              })
            });
          } catch (emailError) {
            console.error("Error sending notification email:", emailError);
          }
        }
      }

      onSuccess();
    } catch (error) {
      console.error("Error saving incident:", error);
      if (error instanceof Error && error.message.includes('too large')) {
        setError('El reporte es demasiado grande (demasiadas imágenes o muy pesadas). Intenta con menos imágenes.');
      } else {
        handleFirestoreError(error, OperationType.CREATE, 'incidents');
      }
    } finally {
      setLoading(false);
    }
  };

  // Filter out super admin from coordinators list
  const filteredCoordinators = coordinators.filter(c => c.email !== 'jorge.villanueva@boletomovil.com');

  return (
    <div className="bg-white rounded-2xl shadow-xl p-6 md:p-8">
      <h2 className="text-2xl font-bold text-slate-900 mb-6">Reportar Incidencia</h2>
      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <InputGroup label="Lugar" required>
            <input
              required
              type="text"
              value={formData.place}
              onChange={(e) => setFormData({ ...formData, place: e.target.value })}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
              placeholder="Ej. Patio central, Aula 3B..."
            />
          </InputGroup>
          <InputGroup label="Colegio" required>
            <select
              required
              value={formData.school}
              onChange={(e) => setFormData({ ...formData, school: e.target.value })}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
            >
              <option value="Diario Victoria">Diario Victoria</option>
              <option value="Diario Esperanza">Diario Esperanza</option>
            </select>
          </InputGroup>
        </div>

        <InputGroup label="Alumnos involucrados" required>
          <input
            required
            type="text"
            value={formData.students}
            onChange={(e) => setFormData({ ...formData, students: e.target.value })}
            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
            placeholder="Nombres de los alumnos..."
          />
        </InputGroup>

        <InputGroup label="Descripción de los hechos" required>
          <textarea
            required
            rows={4}
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
            placeholder="Describe detalladamente lo ocurrido..."
          />
        </InputGroup>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <InputGroup label="Medidas disciplinarias">
            <textarea
              rows={3}
              value={formData.disciplinaryMeasures}
              onChange={(e) => setFormData({ ...formData, disciplinaryMeasures: e.target.value })}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
            />
          </InputGroup>
          <InputGroup label="Seguimiento">
            <textarea
              rows={3}
              value={formData.followUp}
              onChange={(e) => setFormData({ ...formData, followUp: e.target.value })}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
            />
          </InputGroup>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <InputGroup label="Coordinador asignado" required>
            <select
              required
              value={formData.coordinatorId}
              onChange={(e) => setFormData({ ...formData, coordinatorId: e.target.value })}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
            >
              <option value="">Selecciona un coordinador</option>
              {filteredCoordinators.map((c) => (
                <option key={c.uid} value={c.uid}>{c.name}</option>
              ))}
            </select>
          </InputGroup>
          <InputGroup label="Adjuntar Imágenes (Opcional - Máximo 5 archivos)">
            <input
              type="file"
              multiple
              accept="image/*"
              onChange={handleImageChange}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all text-sm"
            />
          </InputGroup>
        </div>

        {images.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {images.map((img, idx) => (
              <div key={idx} className="relative w-20 h-20 rounded-lg overflow-hidden border border-slate-200">
                <img src={img} alt={`Preview ${idx}`} className="w-full h-full object-cover" />
                <button
                  type="button"
                  onClick={() => setImages(prev => prev.filter((_, i) => i !== idx))}
                  className="absolute top-0 right-0 bg-red-500 text-white p-1 rounded-bl-lg"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-center gap-4 pt-4">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 px-6 py-3 border border-slate-200 text-slate-600 font-bold rounded-xl hover:bg-slate-50 transition-all"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={loading}
            className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 px-6 rounded-xl shadow-lg shadow-indigo-100 transition-all disabled:opacity-50"
          >
            {loading ? 'Enviando...' : 'Guardar Reporte'}
          </button>
        </div>
      </form>
    </div>
  );
};

const InputGroup = ({ label, children, required }: { label: string, children: React.ReactNode, required?: boolean }) => (
  <div className="space-y-1.5">
    <label className="text-sm font-bold text-slate-700 flex items-center gap-1">
      {label}
      {required && <span className="text-red-500">*</span>}
    </label>
    {children}
  </div>
);

const UserManagement = ({ profile, coordinators, teachers, admins }: { profile: UserProfile, coordinators: UserProfile[], teachers: UserProfile[], admins: UserProfile[] }) => {
  const [showAddModal, setShowAddModal] = useState(false);
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
  });
  const [newUserRole, setNewUserRole] = useState<UserRole>('TEACHER');
  const [formData, setFormData] = useState({ name: '', email: '', phone: '' });
  const [loading, setLoading] = useState(false);

  const isSuperAdmin = profile.email === 'jorge.villanueva@boletomovil.com';
  const isAdmin = profile.role === 'ADMIN';

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const emailId = formData.email.toLowerCase().trim();
      await setDoc(doc(db, 'users', emailId), {
        ...formData,
        email: emailId,
        role: newUserRole,
        uid: emailId, // Temporary UID until registration
        isRegistered: false,
      });
      setShowAddModal(false);
      setFormData({ name: '', email: '', phone: '' });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `users/${formData.email}`);
    } finally {
      setLoading(false);
    }
  };

  const deleteUser = async (userToDelete: UserProfile) => {
    setConfirmModal({
      isOpen: true,
      title: 'Eliminar Usuario',
      message: '¿Estás seguro de eliminar este usuario? Perderá el acceso al sistema.',
      onConfirm: async () => {
        try {
          const emailId = userToDelete.email.toLowerCase().trim();
          await deleteDoc(doc(db, 'users', emailId));
          setConfirmModal(prev => ({ ...prev, isOpen: false }));
        } catch (error) {
          handleFirestoreError(error, OperationType.DELETE, `users/${userToDelete.email}`);
        }
      }
    });
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Gestión de Usuarios</h1>
          <p className="text-slate-500">
            {isAdmin || isSuperAdmin 
              ? 'Administra administradores, coordinadores y docentes' 
              : 'Administra coordinadores y docentes'}
          </p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl shadow-lg shadow-indigo-100 transition-all font-bold"
        >
          <UserPlus className="w-5 h-5" />
          Nuevo Usuario
        </button>
      </div>

      <div className={cn(
        "grid grid-cols-1 gap-8",
        (isAdmin || isSuperAdmin) ? "md:grid-cols-2 lg:grid-cols-3" : "md:grid-cols-2"
      )}>
        {(isAdmin || isSuperAdmin) && (
          <UserList title="Administradores" users={admins.filter(u => u.email !== 'jorge.villanueva@boletomovil.com')} onDelete={deleteUser} />
        )}
        <UserList title="Coordinadores" users={coordinators.filter(u => u.email !== 'jorge.villanueva@boletomovil.com')} onDelete={deleteUser} />
        <UserList title="Docentes" users={teachers.filter(u => u.email !== 'jorge.villanueva@boletomovil.com')} onDelete={deleteUser} />
      </div>

      {/* Add User Modal */}
      <AnimatePresence>
        {showAddModal && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowAddModal(false)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            />
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl p-8"
            >
              <h2 className="text-2xl font-bold text-slate-900 mb-6">Agregar Usuario</h2>
              <form onSubmit={handleAddUser} className="space-y-4">
                <div className="flex p-1 bg-slate-100 rounded-xl mb-4">
                  <button
                    type="button"
                    onClick={() => setNewUserRole('TEACHER')}
                    className={cn(
                      "flex-1 py-2 text-sm font-bold rounded-lg transition-all",
                      newUserRole === 'TEACHER' ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500"
                    )}
                  >
                    Docente
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewUserRole('COORDINATOR')}
                    className={cn(
                      "flex-1 py-2 text-sm font-bold rounded-lg transition-all",
                      newUserRole === 'COORDINATOR' ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500"
                    )}
                  >
                    Coordinador
                  </button>
                  {(isAdmin || isSuperAdmin) && (
                    <button
                      type="button"
                      onClick={() => setNewUserRole('ADMIN')}
                      className={cn(
                        "flex-1 py-2 text-sm font-bold rounded-lg transition-all",
                        newUserRole === 'ADMIN' ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500"
                      )}
                    >
                      Admin
                    </button>
                  )}
                </div>

                <InputGroup label="Nombre Completo" required>
                  <input
                    required
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-indigo-500 transition-all"
                  />
                </InputGroup>
                <InputGroup label="Correo Electrónico" required>
                  <input
                    required
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-indigo-500 transition-all"
                  />
                </InputGroup>
                <InputGroup label="Teléfono">
                  <input
                    type="tel"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-indigo-500 transition-all"
                  />
                </InputGroup>

                <div className="flex gap-3 pt-4">
                  <button
                    type="button"
                    onClick={() => setShowAddModal(false)}
                    className="flex-1 py-2.5 border border-slate-200 text-slate-600 font-bold rounded-xl hover:bg-slate-50 transition-all"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2.5 rounded-xl shadow-lg shadow-indigo-100 transition-all disabled:opacity-50"
                  >
                    {loading ? 'Guardando...' : 'Guardar'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Confirmation Modal for User Management */}
      <AnimatePresence>
        {confirmModal.isOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative w-full max-w-sm bg-white rounded-2xl shadow-2xl p-6"
            >
              <div className="flex items-center gap-4 mb-4 text-red-600">
                <div className="w-12 h-12 bg-red-50 rounded-full flex items-center justify-center">
                  <AlertCircle className="w-6 h-6" />
                </div>
                <h3 className="text-xl font-bold text-slate-900">{confirmModal.title}</h3>
              </div>
              <p className="text-slate-600 mb-8">{confirmModal.message}</p>
              <div className="flex gap-3">
                <button
                  onClick={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
                  className="flex-1 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold transition-all"
                >
                  Cancelar
                </button>
                <button
                  onClick={confirmModal.onConfirm}
                  className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl font-bold shadow-lg shadow-red-100 transition-all"
                >
                  Eliminar
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

const UserList = ({ title, users, onDelete }: { title: string, users: UserProfile[], onDelete: (user: UserProfile) => void }) => (
  <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
    <div className="p-4 border-b border-slate-100 bg-slate-50/50">
      <h3 className="font-bold text-slate-900">{title}</h3>
    </div>
    <div className="divide-y divide-slate-100">
      {users.length === 0 ? (
        <div className="p-8 text-center text-slate-400 text-sm">No hay {title.toLowerCase()} registrados.</div>
      ) : (
        users.map((u) => (
          <div key={u.email} className="p-4 flex items-center justify-between gap-4">
            <div className="flex-1 min-w-0">
              <p className="font-bold text-slate-900 truncate">{u.name}</p>
              <div className="flex items-center gap-3 mt-1">
                <span className="flex items-center gap-1 text-xs text-slate-500">
                  <Mail className="w-3 h-3" />
                  {u.email}
                </span>
                {u.phone && (
                  <span className="flex items-center gap-1 text-xs text-slate-500">
                    <Phone className="w-3 h-3" />
                    {u.phone}
                  </span>
                )}
              </div>
            </div>
            <button
              onClick={() => onDelete(u)}
              className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        ))
      )}
    </div>
  </div>
);
