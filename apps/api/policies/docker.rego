# Policy Gate 커스텀 규칙 (설계서 Part 2 §6.1).
#
# Trivy가 표준 취약점·설정 오류를 보고, 여기서는 이 플랫폼의 규칙을 강제한다:
# 포트 화이트리스트, 리소스 제한, 이미지 소스 화이트리스트.
#
# LLM이 생성한 설정을 사람이 승인하기 **전에** 돌린다. 사용자가 도커를 몰라서
# 위험한 설정을 그대로 승인할 수 있다는 것이 이 게이트를 둔 이유다 (Part 1 §3.2.1).

package main

import rego.v1

# ── 이미지 소스 ────────────────────────────────────────────────
# 임의의 레지스트리에서 가져온 이미지는 내용을 보증할 수 없다.
allowed_registries := ["docker.io/library/", "gcr.io/", "us-docker.pkg.dev/", "ghcr.io/"]

is_official(image) if {
	# 레지스트리 접두사가 없는 공식 이미지(node:22-alpine 등)는 docker.io/library로 해석된다.
	not contains(image, "/")
}

is_official(image) if {
	some prefix in allowed_registries
	startswith(image, prefix)
}

deny contains msg if {
	some i
	input.services[i].image
	image := input.services[i].image
	not is_official(image)
	msg := sprintf("서비스 '%v'의 이미지 '%v'는 허용된 레지스트리 목록에 없습니다.", [i, image])
}

# ── 태그 고정 ──────────────────────────────────────────────────
# latest는 어제와 오늘이 다른 이미지를 가리킨다. 검사 결과가 의미를 잃는다.
deny contains msg if {
	some i
	image := input.services[i].image
	endswith(image, ":latest")
	msg := sprintf("서비스 '%v'가 latest 태그를 씁니다. 버전을 고정하세요.", [i])
}

deny contains msg if {
	some i
	image := input.services[i].image
	not contains(image, ":")
	msg := sprintf("서비스 '%v'의 이미지에 태그가 없습니다. 버전을 고정하세요.", [i])
}

# ── 권한 상승 ──────────────────────────────────────────────────
deny contains msg if {
	some i
	input.services[i].privileged == true
	msg := sprintf("서비스 '%v'가 privileged 모드입니다. 호스트 커널을 그대로 노출합니다.", [i])
}

deny contains msg if {
	some i
	input.services[i].network_mode == "host"
	msg := sprintf("서비스 '%v'가 host 네트워크를 씁니다. 컨테이너 격리가 사라집니다.", [i])
}

# ── 호스트 마운트 ──────────────────────────────────────────────
# 호스트 루트나 도커 소켓을 넘기면 컨테이너 탈출과 같다.
forbidden_mounts := ["/:", "/etc:", "/var/run/docker.sock"]

deny contains msg if {
	some i
	some v in input.services[i].volumes
	some forbidden in forbidden_mounts
	startswith(v, forbidden)
	msg := sprintf("서비스 '%v'가 위험한 경로를 마운트합니다: %v", [i, v])
}

# ── 리소스 제한 ────────────────────────────────────────────────
# 제한이 없으면 한 컨테이너가 호스트 전체를 굶길 수 있다.
deny contains msg if {
	some i
	input.services[i]
	not input.services[i].deploy.resources.limits.memory
	not input.services[i].mem_limit
	msg := sprintf("서비스 '%v'에 메모리 제한이 없습니다.", [i])
}

# ── 포트 화이트리스트 ──────────────────────────────────────────
# 잘 알려진 관리 포트를 호스트에 그대로 노출하지 않는다.
forbidden_host_ports := {"22", "2375", "2376", "5432", "6379", "27017"}

host_port(spec) := p if {
	parts := split(spec, ":")
	count(parts) > 1
	p := parts[0]
}

deny contains msg if {
	some i
	some spec in input.services[i].ports
	p := host_port(spec)
	forbidden_host_ports[p]
	msg := sprintf("서비스 '%v'가 호스트 포트 %v를 노출합니다. 외부에 열어서는 안 되는 포트입니다.", [i, p])
}
