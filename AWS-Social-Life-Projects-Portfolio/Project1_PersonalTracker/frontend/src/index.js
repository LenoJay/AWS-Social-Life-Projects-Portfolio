import React from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import "maplibre-gl/dist/maplibre-gl.css";
import './App.css';
import App from './App';
import { Amplify } from 'aws-amplify';
import awsconfig from './aws-exports';

Amplify.configure(awsconfig);

const container = document.getElementById('root');
const root = createRoot(container);
root.render(<App />);