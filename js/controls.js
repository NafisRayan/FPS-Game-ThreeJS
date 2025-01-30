// Movement functions
function updatePosition() {
    if(isGameOver) return;
    
    // Get movement input
    const forward = keys['s'] ? 1 : (keys['w'] ? -1 : 0);  // Swap W and S
    const right = keys['d'] ? 1 : (keys['a'] ? -1 : 0);
    
    if(forward !== 0 || right !== 0) {
        // Calculate movement direction based on camera rotation
        const moveAngle = Math.atan2(-right, -forward);  // Invert both axes
        const totalAngle = mouseX + moveAngle;
        
        // Calculate movement vector
        const speed = moveSpeed * (forward !== 0 && right !== 0 ? 0.707 : 1);
        const moveX = -Math.sin(totalAngle) * speed;  // Invert X movement
        const moveZ = -Math.cos(totalAngle) * speed;  // Invert Z movement
        
        // Calculate new position
        const newPosition = new THREE.Vector3(
            camera.position.x + moveX,
            camera.position.y,
            camera.position.z + moveZ
        );
        
        // Collision check with bounds
        if(Math.abs(newPosition.x) < gameConfig.scene.bounds.x && 
           Math.abs(newPosition.z) < gameConfig.scene.bounds.z && 
           !checkCollisions(newPosition)) {
            camera.position.copy(newPosition);
        }
    }
}

function checkCollisions(newPosition) {
    const playerRadius = 0.5;
    for(let obj of collisionObjects) {
        const box = new THREE.Box3().setFromObject(obj);
        const sphere = new THREE.Sphere(newPosition, playerRadius);
        if(box.intersectsSphere(sphere)) {
            return true;
        }
    }
    return false;
}

// Event listeners
document.addEventListener('keydown', (e) => {
    keys[e.key.toLowerCase()] = true;
    if(e.key.toLowerCase() === 'r') {
        reload();
    }
});

document.addEventListener('keyup', (e) => keys[e.key.toLowerCase()] = false);

document.addEventListener('mousemove', (e) => {
    if(isGameOver) return;
    mouseX -= e.movementX * 0.002;
    // Ensure vertical rotation stays within bounds and maintains consistent sensitivity
    const newMouseY = mouseY + e.movementY * 0.002;
    mouseY = Math.min(Math.max(newMouseY, -Math.PI/2), Math.PI/2);
});

document.addEventListener('click', () => {
    if(isGameOver) return;
    shoot();
    document.body.requestPointerLock();
});

// Pointer lock setup
document.body.requestPointerLock = document.body.requestPointerLock || 
                                 document.body.mozRequestPointerLock;

// Export functions
window.updatePosition = updatePosition;
window.checkCollisions = checkCollisions;
