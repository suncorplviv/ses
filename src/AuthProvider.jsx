import React, { createContext, useState, useEffect, useContext, useRef } from 'react';
import { supabase } from './supabaseClient'; 

const AuthContext = createContext({});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [employeeProfile, setEmployeeProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  const userRef = useRef(user);

  useEffect(() => {
    userRef.current = user;
  }, [user]);

  // ОНОВЛЕНО: Тепер шукаємо в таблиці `users` по `id`
  const fetchEmployeeProfile = async (userId) => {
    try {
      const { data } = await supabase
        .from('users')
        .select('*')
        .eq('id', userId)
        .single();
        
      if (data) setEmployeeProfile(data);
    } catch (error) {
      console.error("Profile fetch error:", error);
    }
  };

  const refreshSession = async () => {
    if (!userRef.current) return; 

    try {
      const { data, error } = await supabase.auth.refreshSession();
      if (!error && data.session) {
         setUser(data.session.user);
      }
    } catch (e) {
      console.error("Connection error:", e);
    }
  };

  useEffect(() => {
    let mounted = true;

    const initializeAuth = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          setUser(session.user);
          await fetchEmployeeProfile(session.user.id);
        }
      } catch (error) {
        console.error("Init error:", error);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    initializeAuth();

    const { data: listener } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' && session?.user) {
        setUser(session.user);
        fetchEmployeeProfile(session.user.id);
      } else if (event === 'SIGNED_OUT') {
        setUser(null);
        setEmployeeProfile(null);
      } else if (event === 'TOKEN_REFRESHED' && session?.user) {
        setUser(session.user);
      }
    });

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        if (userRef.current) {
            refreshSession();
        }
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  const signOut = async () => {
    return supabase.auth.signOut();
  };

  // ОНОВЛЕНО: Тепер ролі читаються з поля `role` нашої нової таблиці
  const value = {
    user,
    employeeProfile,
    role: employeeProfile?.role || null,
    customId: employeeProfile?.custom_id || null, // Додав custom_id, він знадобиться в UI
    isDirector: employeeProfile?.role === 'Директор',
    isAdmin: ['Директор', 'Засновник'].includes(employeeProfile?.role),
    isOffice: ['Менеджер', 'Інженер', 'Директор', 'Засновник'].includes(employeeProfile?.role),
    signOut,
    loading
  };

  if (loading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-white">
         <div className="w-10 h-10 border-4 border-amber-500/30 border-t-amber-500 rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};
