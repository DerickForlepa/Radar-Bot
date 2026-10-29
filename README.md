# Radar (protótipo pessoal, iPhone)

Avisador de radares em segundo plano: lê o GPS, descobre os radares **à frente na sua direção**
e avisa por voz (pt-BR) por cima do Waze/Google Maps/música, mesmo com a tela apagada.

## Como funciona
- `src/engine.ts`: lógica de alerta. Filtra por distância (~20 s de antecedência), cone de ±30° do rumo,
  distância lateral (ignora pista oposta/ruas paralelas) e sentido do radar, quando conhecido.
  Dá 2 avisos por radar ("Radar à frente, 400 metros, limite 60" e "Radar") e "Reduza a velocidade" se passar do limite.
- `src/radars.ts`: base local. Baixa radares do OpenStreetMap (Overpass) num raio de 30 km e guarda os que você marcar à mão.
- `src/tracker.ts`: localização em segundo plano (expo-location + task-manager) e voz (expo-speech),
  com o áudio configurado para abaixar o volume dos outros apps durante o aviso.

## Sem Mac: build grátis pelo GitHub + Sideloadly
1. Crie um repositório no GitHub e envie esta pasta (público = minutos grátis ilimitados;
   privado consome a cota, e macOS conta 10x).
2. Aba **Actions** > **Build iOS (.ipa sem assinatura)** > **Run workflow**. Leva ~15-30 min.
3. Quando terminar, baixe o artefato **Radar-ipa** (zip com o `Radar.ipa` dentro).
4. No PC/Mac, instale o **Sideloadly**, conecte o iPhone por cabo, arraste o `Radar.ipa`,
   entre com seu Apple ID e clique em Start.
5. No iPhone: Ajustes > Privacidade e Segurança > **Modo Desenvolvedor** (ligar e reiniciar) e
   Ajustes > Geral > VPN e Gerenciamento de Dispositivo > confiar no seu Apple ID.
6. Abra o app, aceite a localização e escolha **"Sempre"**.

Conta Apple gratuita: o app expira em 7 dias (basta reinstalar pelo Sideloadly) e limite de 3 apps.
Se o workflow falhar, o erro costuma ser versão do Xcode no runner; abra o log da etapa
"Compilar sem assinatura" e me mande o final dele.

## Rodar no iPhone (com Mac)
Localização em segundo plano **não funciona no Expo Go**; precisa de um build de desenvolvimento no iPhone.

Com Mac + Xcode (grátis, com Apple ID pessoal; o app expira a cada 7 dias e você reinstala):
```
npm install
npx expo prebuild --platform ios
npx expo run:ios --device
```
Na primeira vez, no iPhone: Ajustes > Geral > VPN e Gerenciamento de Dispositivo > confiar no seu Apple ID.
Ao abrir o app, aceite a localização e depois escolha **"Sempre"**.

Para só ver a tela e testar a voz sem build: `npx expo start` e abrir no Expo Go.

## Uso
1. **Baixar radares da região**: com internet, uma vez por região.
2. **Iniciar**, abrir o Waze/Maps e dirigir.
3. **Marcar radar aqui**: em movimento, passando pelo radar. Salva a posição e o sentido.
4. **Testar voz**: confira se o aviso abaixa o volume do Waze.

## Limitações conhecidas
- A cobertura de radares do Brasil no OpenStreetMap é irregular; marque os que faltarem.
- Radares sem sentido cadastrado dependem só do cone/distância lateral.
- Não testado em estrada real ainda. Ajuste os parâmetros em `CONFIG` no `src/engine.ts`.
