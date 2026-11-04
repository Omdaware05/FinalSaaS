import React from 'react';
import { RouterProvider } from 'react-router-dom';
import { router } from './router';
import { ThemeProvider } from './providers/ThemeProvider';
import { AuthProvider } from './providers/AuthProvider';
import { QueryProvider } from './providers/QueryProvider';
import { ToastProvider } from './providers/ToastProvider';
import { BusinessProvider } from './providers/BusinessProvider';

export const App: React.FC = () => {
  return (
    <ThemeProvider>
      <QueryProvider>
        <AuthProvider>
          <BusinessProvider>
            <ToastProvider>
              <RouterProvider router={router} />
            </ToastProvider>
          </BusinessProvider>
        </AuthProvider>
      </QueryProvider>
    </ThemeProvider>
  );
};

export default App;

