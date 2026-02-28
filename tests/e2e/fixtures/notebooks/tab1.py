# ---
# jupyter:
#   jupytext:
#     formats: ipynb,py:percent
#     text_representation:
#       extension: .py
#       format_name: percent
#       format_version: '1.3'
#       jupytext_version: 1.19.1
#   kernelspec:
#     display_name: Python 3 (ipykernel)
#     language: python
#     name: python3
# ---

# %%
import os
import tempfile

import numpy as np

# Use a writable cache path in restricted/sandboxed environments.
os.environ.setdefault("MPLCONFIGDIR", os.path.join(tempfile.gettempdir(), "matplotlib"))
os.environ.setdefault("XDG_CACHE_HOME", tempfile.gettempdir())

import matplotlib.pyplot as plt

# %%
SCATTERING_PARAMS = {
    "nx": 1024,
    "x_min": -200.0,
    "x_max": 200.0,
    "hbar": 1.0,
    "mass": 1.0,
    "dt": 0.03,
    "n_steps": 1400,
    "save_every": 8,
    "barrier_height": 1.0,
    "barrier_width": 8.0,
    "x0": -90.0,
    "sigma": 10.0,
    "k0": 1.3,
}


# %%
def simulate_1d_scattering(
    nx=1024,
    x_min=-200.0,
    x_max=200.0,
    hbar=1.0,
    mass=1.0,
    dt=0.03,
    n_steps=1400,
    save_every=8,
    barrier_height=1.0,
    barrier_width=8.0,
    x0=-90.0,
    sigma=10.0,
    k0=1.3,
):
    """분할 단계 FFT를 이용한 1차원 시간의존 슈뢰딩거 방정식 산란 시뮬레이션."""
    if not isinstance(nx, int):
        raise TypeError("nx must be an integer")
    if not isinstance(n_steps, int):
        raise TypeError("n_steps must be an integer")
    if not isinstance(save_every, int):
        raise TypeError("save_every must be an integer")
    if nx < 8:
        raise ValueError("nx must be >= 8")
    if x_max <= x_min:
        raise ValueError("x_max must be greater than x_min")
    if hbar <= 0 or mass <= 0:
        raise ValueError("hbar and mass must be positive")
    if dt <= 0 or n_steps <= 0 or save_every <= 0:
        raise ValueError("dt, n_steps, and save_every must be positive")
    if sigma <= 0:
        raise ValueError("sigma must be positive")
    if barrier_width < 0:
        raise ValueError("barrier_width must be non-negative")

    # 실공간 격자(x), 파수공간 격자(k) 생성
    x = np.linspace(x_min, x_max, nx, endpoint=False)
    dx = x[1] - x[0]
    k = 2.0 * np.pi * np.fft.fftfreq(nx, d=dx)

    # 중앙 사각 장벽 퍼텐셜
    V = np.where(np.abs(x) < barrier_width / 2.0, barrier_height, 0.0)

    psi = np.exp(-((x - x0) ** 2) / (4.0 * sigma**2)) * np.exp(1j * k0 * x)
    psi /= np.sqrt(np.sum(np.abs(psi) ** 2) * dx)
    norm_initial = 1.0

    # 분할 연산자(퍼텐셜 반 스텝 + 운동에너지 한 스텝)
    exp_v_half = np.exp(-1j * V * dt / (2.0 * hbar))
    exp_t = np.exp(-1j * (hbar * k**2 / (2.0 * mass)) * dt)

    snapshots = []
    times = []

    for step in range(n_steps):
        psi = exp_v_half * psi
        psi_k = np.fft.fft(psi)
        psi_k *= exp_t
        psi = np.fft.ifft(psi_k)
        psi = exp_v_half * psi

        # 일정 간격으로 확률밀도 스냅샷 저장
        if step % save_every == 0:
            snapshots.append(np.abs(psi) ** 2)
            times.append((step + 1) * dt)

    # 좌/중앙/우 영역별 확률 계산
    left_region = x < -barrier_width / 2.0
    right_region = x > barrier_width / 2.0
    center_region = ~(left_region | right_region)

    norm_final = np.sum(np.abs(psi) ** 2) * dx
    reflection = np.sum(np.abs(psi[left_region]) ** 2) * dx / norm_final
    transmission = np.sum(np.abs(psi[right_region]) ** 2) * dx / norm_final
    center_probability = np.sum(np.abs(psi[center_region]) ** 2) * dx / norm_final

    return {
        "x": x,
        "V": V,
        "density_map": np.array(snapshots),
        "times": np.array(times),
        "reflection": reflection,
        "transmission": transmission,
        "center_probability": center_probability,
        "probability_balance": reflection + transmission + center_probability,
        "norm_drift": abs(norm_final - norm_initial),
        "norm_final": norm_final,
    }


def validate_scattering_result(result, params, norm_tol=1e-8, prob_tol=5e-3):
    # 결과 배열 형태, 시간 증가성, 확률 보존 성질 검증
    density_map = result["density_map"]
    times = result["times"]
    nx = params["nx"]
    n_steps = params["n_steps"]
    save_every = params["save_every"]

    expected_n_snapshots = (n_steps - 1) // save_every + 1
    if density_map.shape != (expected_n_snapshots, nx):
        raise ValueError(
            f"density_map shape mismatch: expected {(expected_n_snapshots, nx)}, got {density_map.shape}"
        )
    if times.shape != (expected_n_snapshots,):
        raise ValueError(
            f"times shape mismatch: expected {(expected_n_snapshots,)}, got {times.shape}"
        )
    if np.any(density_map < -1e-14):
        raise ValueError("Density has negative values below numerical tolerance.")
    if not np.all(np.diff(times) > 0):
        raise ValueError("times must be strictly increasing.")
    if result["norm_drift"] > norm_tol:
        raise ValueError(f"Norm drift is too large: {result['norm_drift']:.3e}")
    if abs(result["probability_balance"] - 1.0) > prob_tol:
        raise ValueError(
            "Reflection + Transmission + Center probability is out of range: "
            f"{result['probability_balance']:.6f}"
        )


result = simulate_1d_scattering(**SCATTERING_PARAMS)
print(f"Reflection ~ {result['reflection']:.3f}")
print(f"Transmission ~ {result['transmission']:.3f}")
print(f"Center prob. ~ {result['center_probability']:.3f}")
print(f"R + T + C ~ {result['probability_balance']:.3f}")
print(f"Norm drift ~ {result['norm_drift']:.2e}")
validate_scattering_result(result, SCATTERING_PARAMS)
print("Validation passed: norm, shape, and probability checks are within tolerance.")

# %%
# 1D scattering visualization
x = result["x"]
V = result["V"]
density_map = result["density_map"]
times = result["times"]

snapshot_idx = [0, len(density_map) // 3, 2 * len(density_map) // 3, len(density_map) - 1]

plt.figure(figsize=(10, 5))
for idx in snapshot_idx:
    plt.plot(x, density_map[idx], label=f"t = {times[idx]:.2f}")

v_max = np.max(V)
v_scale = v_max if v_max > 0 else 1.0
plt.plot(x, V / (v_scale * 8.0), "k--", alpha=0.7, label="Potential (scaled)")
plt.xlim(-150, 120)
plt.ylim(bottom=0)
plt.xlabel("x")
plt.ylabel(r"$|\psi(x,t)|^2$")
plt.title("Wave Packet Scattering")
plt.legend()
plt.tight_layout()
plt.show()

plt.figure(figsize=(10, 5))
extent = [x[0], x[-1], times[-1], times[0]]
plt.imshow(density_map, aspect="auto", extent=extent, cmap="magma")
plt.colorbar(label=r"$|\psi|^2$")
plt.xlabel("x")
plt.ylabel("time")
plt.title("Probability Density Evolution")
plt.tight_layout()
plt.show()

# %%
def simulate_two_level(delta=1.0, omega=2.0, dt=0.01, n_steps=3000):
    """Two-level system with Hamiltonian H = (delta/2) sz + (omega/2) sx."""
    # 시간 간격과 스텝 수의 기본 유효성 검사
    if dt <= 0:
        raise ValueError("dt must be positive")
    if not isinstance(n_steps, int):
        raise TypeError("n_steps must be an integer")
    if n_steps <= 1:
        raise ValueError("n_steps must be > 1")

    # 파울리 행렬 정의
    sigma_x = np.array([[0.0, 1.0], [1.0, 0.0]], dtype=complex)
    sigma_z = np.array([[1.0, 0.0], [0.0, -1.0]], dtype=complex)

    # 해밀토니안 고유분해로 한 스텝 진화 연산자 U(dt) 구성
    H = 0.5 * delta * sigma_z + 0.5 * omega * sigma_x
    evals, evecs = np.linalg.eigh(H)
    U_dt = evecs @ np.diag(np.exp(-1j * evals * dt)) @ evecs.conj().T

    # 초기 상태 |0>에서 시작하여 각 시간의 점유 확률 저장
    psi = np.array([1.0 + 0j, 0.0 + 0j])
    t = np.arange(n_steps) * dt
    p0 = np.empty(n_steps)
    p1 = np.empty(n_steps)

    for i in range(n_steps):
        p0[i] = np.abs(psi[0]) ** 2
        p1[i] = np.abs(psi[1]) ** 2
        psi = U_dt @ psi

    return t, p0, p1


def validate_two_level_result(t, p0, p1, tol=1e-10):
    # 배열 차원/길이/물리적 보존량을 점검하는 검증 함수
    if t.ndim != 1 or p0.ndim != 1 or p1.ndim != 1:
        raise ValueError("t, p0, and p1 must be 1D arrays")
    if not (len(t) == len(p0) == len(p1)):
        raise ValueError("t, p0, and p1 must have the same length")
    if np.any(p0 < -tol) or np.any(p1 < -tol):
        raise ValueError("Population contains negative values below tolerance")
    if not np.all(np.diff(t) > 0):
        raise ValueError("time values must be strictly increasing")
    if np.max(np.abs((p0 + p1) - 1.0)) > tol:
        raise ValueError("Population conservation check failed: p0 + p1 != 1")


t2, p0, p1 = simulate_two_level()
validate_two_level_result(t2, p0, p1)
print("Two-level validation passed: shape, monotonic time, and population conservation.")
plt.figure(figsize=(9, 4))
plt.plot(t2, p0, label="P(|0>)")
plt.plot(t2, p1, label="P(|1>)")
plt.xlabel("time")
plt.ylabel("population")
plt.title("Two-Level Quantum Oscillation")
plt.legend()
plt.tight_layout()
plt.show()
