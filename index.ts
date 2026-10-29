import { registerRootComponent } from 'expo';

// Importa primeiro: registra a tarefa de localização em segundo plano
import './src/tracker';
import App from './App';

registerRootComponent(App);
