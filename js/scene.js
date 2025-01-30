// Scene setup
const scene = new THREE.Scene();
scene.background = new THREE.Color(gameConfig.scene.background);
scene.fog = new THREE.Fog(gameConfig.scene.background, gameConfig.scene.fogNear, gameConfig.scene.fogFar);

// Camera setup
const camera = new THREE.PerspectiveCamera(
    gameConfig.scene.cameraFOV,
    window.innerWidth / window.innerHeight,
    gameConfig.scene.cameraNear,
    gameConfig.scene.cameraFar
);

// Renderer setup
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

// Lighting setup
const ambientLight = new THREE.AmbientLight(
    lightConfig.ambient.color,
    lightConfig.ambient.intensity
);
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(
    lightConfig.directional.color,
    lightConfig.directional.intensity
);
directionalLight.position.set(
    lightConfig.directional.position.x,
    lightConfig.directional.position.y,
    lightConfig.directional.position.z
);
directionalLight.castShadow = true;

// Configure shadow properties
directionalLight.shadow.camera.near = lightConfig.directional.shadow.near;
directionalLight.shadow.camera.far = lightConfig.directional.shadow.far;
directionalLight.shadow.camera.left = lightConfig.directional.shadow.left;
directionalLight.shadow.camera.right = lightConfig.directional.shadow.right;
directionalLight.shadow.camera.top = lightConfig.directional.shadow.top;
directionalLight.shadow.camera.bottom = lightConfig.directional.shadow.bottom;
directionalLight.shadow.mapSize.width = lightConfig.directional.shadow.mapSize;
directionalLight.shadow.mapSize.height = lightConfig.directional.shadow.mapSize;

scene.add(directionalLight);

// Materials
const textureLoader = new THREE.TextureLoader();
const grassTexture = textureLoader.load('https://img.pikbest.com/ai/illus_our/20230530/69254d1acd8a08d3ef9bd5017cc5a140.jpg!sw800');
grassTexture.wrapS = THREE.RepeatWrapping;
grassTexture.wrapT = THREE.RepeatWrapping;
grassTexture.repeat.set(groundConfig.material.textureRepeat, groundConfig.material.textureRepeat);

// Create ground
const groundGeometry = new THREE.BoxGeometry(
    groundConfig.size.width,
    groundConfig.size.height,
    groundConfig.size.depth
);

const groundMaterial = new THREE.MeshPhongMaterial({
    map: grassTexture,
    bumpMap: grassTexture,
    bumpScale: 0.2,
    color: groundConfig.material.color,
    specular: groundConfig.material.specular,
    shininess: groundConfig.material.shininess
});

const ground = new THREE.Mesh(groundGeometry, groundMaterial);
ground.position.set(
    groundConfig.position.x,
    groundConfig.position.y,
    groundConfig.position.z
);
ground.receiveShadow = true;
scene.add(ground);

// Handle window resize
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// Set initial camera position
camera.position.set(0, gameConfig.scene.playerHeight, 0);

// Export scene elements
window.scene = scene;
window.camera = camera;
window.renderer = renderer;
window.textureLoader = textureLoader;
