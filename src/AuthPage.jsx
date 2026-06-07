import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { FaEye, FaEyeSlash, FaUser, FaLock, FaEnvelope, FaSignInAlt, FaUserPlus, FaCheckCircle, FaExclamationTriangle } from "react-icons/fa";

import logoImg from './logo.svg'; 
import { supabase } from './supabaseClient';

const InputField = ({ name, type, placeholder, value, onChange, icon, disabled, required = true, minLength }) => (
  <div className="relative group mb-4">
    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-amber-500 transition-colors duration-300">
      {icon}
    </span>
    <input
      type={type}
      name={name}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      required={required}
      disabled={disabled}
      minLength={minLength}
      className="w-full pl-12 pr-4 py-3.5 bg-slate-50/50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500 transition-all duration-300 text-slate-800 placeholder-slate-400 backdrop-blur-sm"
    />
  </div>
);

const PasswordPolicy = ({ password }) => {
    const checks = {
        length: password.length >= 8,
        number: /\d/.test(password),
        specialChar: /[!@#$%^&*(),.?":{}|<>]/.test(password),
    };

    const Requirement = ({ text, met }) => (
        <div className={`flex items-center text-xs transition-colors duration-300 ${met ? 'text-emerald-600' : 'text-slate-400'}`}>
            {met ? <FaCheckCircle className="mr-2" /> : <FaExclamationTriangle className="mr-2" />}
            <span>{text}</span>
        </div>
    );

    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2 p-3 bg-slate-50/50 rounded-xl border border-slate-100">
            <Requirement text="Мінімум 8 символів" met={checks.length} />
            <Requirement text="Хоча б одна цифра" met={checks.number} />
            <Requirement text="Спецсимвол (!@#...)" met={checks.specialChar} />
        </div>
    );
};

export default function AuthPage() {
  const [isSignIn, setIsSignIn] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [isLoading, setIsLoading] = useState(true); 
  const [rememberMe, setRememberMe] = useState(false);
  
  const [formData, setFormData] = useState({
    fullName: "",
    email: "",
    password: "",
    confirmPassword: "",
  });
  
  const navigate = useNavigate();

  useEffect(() => {
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        navigate("/home");
      } else {
        setIsLoading(false);
      }
    };
    checkSession();

    const savedEmail = localStorage.getItem("solar_saved_email");
    if (savedEmail) {
      setFormData(prev => ({ ...prev, email: savedEmail }));
      setRememberMe(true);
    }
    
    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session) {
        navigate("/home");
      }
    });

    return () => {
      authListener?.subscription.unsubscribe();
    };
  }, [navigate]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData({ ...formData, [name]: value });
    if (error) setError("");
    if (successMessage) setSuccessMessage("");
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSuccessMessage("");
    
    if (!isSignIn) {
      if (formData.password !== formData.confirmPassword) {
        setError("Паролі не співпадають.");
        return;
      }
      const passwordIsValid = formData.password.length >= 8 && /\d/.test(formData.password) && /[!@#$%^&*(),.?":{}|<>]/.test(formData.password);
      if (!passwordIsValid) {
        setError("Пароль не відповідає вимогам безпеки.");
        return;
      }
    }
    
    setIsLoading(true);

    try {
      if (!isSignIn) {
        // Реєстрація в Supabase Auth
        const { data: authData, error: authError } = await supabase.auth.signUp({
          email: formData.email,
          password: formData.password,
        });

        if (authError) throw authError;
        if (!authData.user) throw new Error("Не вдалося створити користувача.");

        // Запис у таблицю `users` з найнижчою дефолтною роллю
        const { error: profileError } = await supabase.from("users").insert({
          id: authData.user.id,
          full_name: formData.fullName,
          role: "Бригадир", // Змінено: Тепер за замовчуванням найнижча роль
          is_active: true
        });

        if (profileError) throw profileError;
        setSuccessMessage("Реєстрація успішна! Підтвердіть свою пошту.");
        toggleMode();

      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: formData.email,
          password: formData.password,
        });
        if (signInError) throw signInError;

        if (rememberMe) {
          localStorage.setItem("solar_saved_email", formData.email);
        } else {
          localStorage.removeItem("solar_saved_email");
        }
      }
    } catch (err) {
      const errorMessage = err.message || "Сталася невідома помилка.";
      if (errorMessage.includes("already registered")) setError("Користувач з такою поштою вже існує.");
      else if (errorMessage.includes("Invalid login")) setError("Невірна пошта або пароль.");
      else setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const toggleMode = () => {
    setIsSignIn(!isSignIn);
    setFormData(prev => ({ fullName: "", email: prev.email, password: "", confirmPassword: "" }));
    setError("");
    setSuccessMessage("");
    setShowPassword(false);
    setShowConfirmPassword(false);
  };
  
  if (isLoading && !error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
         <div className="w-12 h-12 border-4 border-amber-500/30 border-t-amber-500 rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex w-full bg-white font-sans">
      
      {/* ЛІВА ЧАСТИНА: Брендинг Сонячної корпорації */}
      <div className="hidden lg:flex w-1/2 bg-slate-900 relative items-center justify-center overflow-hidden">
        {/* Теплі "сонячні" градієнтні абстракції */}
        <div className="absolute top-[-10%] left-[-10%] w-[40rem] h-[40rem] bg-amber-500/20 rounded-full blur-[100px]"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[30rem] h-[30rem] bg-orange-600/20 rounded-full blur-[100px]"></div>
        
        <div className="relative z-10 text-center px-12">
          <motion.div 
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.8 }}
            className="w-32 h-32 bg-white/10 backdrop-blur-md rounded-3xl flex items-center justify-center mx-auto mb-8 border border-white/20 shadow-2xl"
          >
            <img src={logoImg} alt="Solar Logo" className="w-20 h-20 object-contain drop-shadow-xl" />
          </motion.div>
          
          <motion.h1 
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="text-4xl font-bold text-white mb-4 tracking-tight"
          >
            Сонячна Корпорація
          </motion.h1>
          <motion.p 
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.4 }}
            className="text-lg text-slate-300 max-w-md mx-auto"
          >
            Внутрішня система управління проєктами, фінансами та логістикою.
          </motion.p>
        </div>
      </div>

      {/* ПРАВА ЧАСТИНА: Форма */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-8 sm:p-12 xl:p-24 relative">
        <div className="w-full max-w-md">
          
          <div className="lg:hidden flex justify-center mb-8">
            <div className="w-20 h-20 bg-slate-900 rounded-2xl flex items-center justify-center shadow-lg">
              <img src={logoImg} alt="Logo" className="w-12 h-12 object-contain" />
            </div>
          </div>

          <AnimatePresence mode="wait">
            <motion.div
              key={isSignIn ? "signIn" : "signUp"}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.3 }}
            >
              <h2 className="text-3xl font-bold text-slate-800 mb-2 tracking-tight">
                {isSignIn ? "З поверненням" : "Створення акаунту"}
              </h2>
              <p className="text-slate-500 mb-8">
                {isSignIn ? "Увійдіть до системи Сонячної корпорації" : "Зареєструйтесь для доступу до порталу"}
              </p>

              {error && (
                <div className="bg-red-50 border-l-4 border-red-500 text-red-700 px-4 py-3 rounded-lg mb-6 text-sm font-medium">
                  {error}
                </div>
              )}
              
              {successMessage && (
                <div className="bg-emerald-50 border-l-4 border-emerald-500 text-emerald-700 px-4 py-3 rounded-lg mb-6 text-sm font-medium">
                  {successMessage}
                </div>
              )}

              <form onSubmit={handleSubmit}>
                {!isSignIn && (
                  <InputField name="fullName" type="text" placeholder="ПІБ (Повне ім'я)" value={formData.fullName} onChange={handleChange} icon={<FaUser />} disabled={isLoading}/>
                )}

                <InputField name="email" type="email" placeholder="Електронна пошта" value={formData.email} onChange={handleChange} icon={<FaEnvelope />} disabled={isLoading}/>
                
                <div className="relative mb-2">
                  <InputField name="password" type={showPassword ? "text" : "password"} placeholder="Пароль" value={formData.password} onChange={handleChange} icon={<FaLock />} disabled={isLoading} minLength={8}/>
                  <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-4 top-[28px] -translate-y-1/2 text-slate-400 hover:text-amber-500 transition-colors">
                    {showPassword ? <FaEyeSlash /> : <FaEye />}
                  </button>
                </div>

                {!isSignIn && (
                   <>
                    <div className="relative mb-2">
                        <InputField name="confirmPassword" type={showConfirmPassword ? "text" : "password"} placeholder="Підтвердити пароль" value={formData.confirmPassword} onChange={handleChange} icon={<FaLock />} disabled={isLoading} minLength={8}/>
                        <button type="button" onClick={() => setShowConfirmPassword(!showConfirmPassword)} className="absolute right-4 top-[28px] -translate-y-1/2 text-slate-400 hover:text-amber-500 transition-colors">
                            {showConfirmPassword ? <FaEyeSlash /> : <FaEye />}
                        </button>
                    </div>
                    <PasswordPolicy password={formData.password} />
                   </>
                )}

                 {isSignIn && (
                    <div className="flex items-center justify-between mb-2">
                       <label className="flex items-center text-sm text-slate-600 cursor-pointer group">
                           <input 
                              type="checkbox" 
                              checked={rememberMe}
                              onChange={(e) => setRememberMe(e.target.checked)}
                              className="h-4 w-4 rounded border-slate-300 text-amber-500 focus:ring-amber-500 transition-all" 
                            />
                           <span className="ml-2 group-hover:text-slate-900 transition-colors">Запам'ятати мій email</span>
                       </label>
                    </div>
                 )}

                <motion.button 
                    whileHover={{ scale: 1.01 }} 
                    whileTap={{ scale: 0.99 }} 
                    type="submit" 
                    disabled={isLoading} 
                    className="w-full px-6 py-4 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-300 text-white rounded-xl font-semibold transition-all duration-300 flex items-center justify-center space-x-3 mt-8 shadow-md"
                >
                  {isLoading ? (
                    <div className="flex items-center space-x-2">
                      <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                      <span>ОБРОБКА...</span>
                    </div>
                  ) : (
                    <>
                      {isSignIn ? <FaSignInAlt /> : <FaUserPlus />}
                      <span>{isSignIn ? "УВІЙТИ В СИСТЕМУ" : "СТВОРИТИ АКАУНТ"}</span>
                    </>
                  )}
                </motion.button>
              </form>
            </motion.div>
          </AnimatePresence>
          
          <div className="mt-8 pt-6 border-t border-slate-100 text-center">
              <span className="text-sm text-slate-500">
                {isSignIn ? 'Немає доступу?' : 'Вже в команді?'}
              </span>
              <button
                onClick={toggleMode}
                disabled={isLoading}
                className="ml-2 text-sm font-semibold text-amber-600 hover:text-amber-700 transition-colors focus:outline-none"
              >
                {isSignIn ? 'Зареєструватись' : 'Увійти'}
              </button>
           </div>
        </div>
      </div>
    </div>
  );
}