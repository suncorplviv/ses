// supabaseClient.js
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://ylsffxnlbapdtalmequm.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inlsc2ZmeG5sYmFwZHRhbG1lcXVtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgxMDc2MDQsImV4cCI6MjA5MzY4MzYwNH0.YhlbYit-ZfrtgP3FURLQSp3E7CjRX04AjkOt4yUs4oM";

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
